import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface BorrowingRequest {
  id: string;
  purpose: string;
  requested_at: string;
  start_time: string;
  end_time: string;
  status: string;
  approval_notes?: string;
  items: {
    name: string;
    type: string;
    room_name: string;
  };
  profiles: {
    full_name: string;
    nim_nip?: string;
  };
}

const Requests = () => {
  const { userRole, profile } = useAuth();
  const [requests, setRequests] = useState<BorrowingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<BorrowingRequest | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');

  useEffect(() => {
    fetchRequests();

    // Setup realtime subscription
    const channel = supabase
      .channel('requests-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'borrowing_requests' }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('borrowing_requests')
      .select(`
        *,
        items(name, type, room_name),
        profiles!borrowing_requests_borrower_id_fkey(full_name, nim_nip)
      `)
      .order('requested_at', { ascending: false });

    if (error) {
      toast.error('Gagal memuat permintaan');
      console.error(error);
    } else {
      setRequests(data || []);
    }
    setLoading(false);
  };

  const handleApproveReject = async (requestId: string, status: 'approved' | 'rejected') => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { error: updateError } = await supabase
      .from('borrowing_requests')
      .update({
        status,
        approved_by: userData.user.id,
        approved_at: new Date().toISOString(),
        approval_notes: approvalNotes,
      })
      .eq('id', requestId);

    if (updateError) {
      toast.error('Gagal memproses permintaan');
      console.error(updateError);
      return;
    }

    // Update item status if approved
    if (status === 'approved' && selectedRequest) {
      await supabase
        .from('items')
        .update({ status: 'dipinjam' })
        .eq('id', selectedRequest.items.name);
    }

    // Log activity
    await supabase.from('activity_logs').insert({
      request_id: requestId,
      action: status === 'approved' ? 'approve' : 'reject',
      performed_by: userData.user.id,
      notes: approvalNotes,
    });

    toast.success(status === 'approved' ? 'Permintaan disetujui' : 'Permintaan ditolak');
    setDialogOpen(false);
    setApprovalNotes('');
    fetchRequests();
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string; icon: any }> = {
      pending: { variant: 'secondary', label: 'Pending', icon: Clock },
      approved: { variant: 'default', label: 'Disetujui', icon: CheckCircle },
      rejected: { variant: 'destructive', label: 'Ditolak', icon: XCircle },
      returned: { variant: 'outline', label: 'Dikembalikan', icon: CheckCircle },
    };

    const config = variants[status] || { variant: 'secondary', label: status, icon: Clock };
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant as any} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <DashboardLayout currentPage="/requests">
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Permintaan Peminjaman</h2>
          <p className="text-muted-foreground">
            {userRole === 'siswa' ? 'Riwayat permintaan Anda' : 'Kelola permintaan peminjaman'}
          </p>
        </div>

        {/* Requests List */}
        <div className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-center text-muted-foreground">Memuat data...</p>
              </CardContent>
            </Card>
          ) : requests.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-center text-muted-foreground">Belum ada permintaan</p>
              </CardContent>
            </Card>
          ) : (
            requests.map((request) => (
              <Card key={request.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">
                        {request.items?.name} - {request.items?.room_name}
                      </CardTitle>
                      <CardDescription>
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3" />
                          {request.profiles?.full_name}
                          {request.profiles?.nim_nip && ` (${request.profiles.nim_nip})`}
                        </div>
                      </CardDescription>
                    </div>
                    {getStatusBadge(request.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Tujuan:</p>
                    <p className="text-sm text-muted-foreground">{request.purpose}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium">Waktu Mulai:</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(request.start_time), 'dd MMM yyyy, HH:mm', { locale: id })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Waktu Selesai:</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(request.end_time), 'dd MMM yyyy, HH:mm', { locale: id })}
                      </p>
                    </div>
                  </div>
                  {request.approval_notes && (
                    <div>
                      <p className="text-sm font-medium">Catatan Approval:</p>
                      <p className="text-sm text-muted-foreground">{request.approval_notes}</p>
                    </div>
                  )}
                  {request.status === 'pending' && (userRole === 'admin' || userRole === 'guru') && (
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={() => {
                          setSelectedRequest(request);
                          setDialogOpen(true);
                        }}
                        className="flex-1"
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Setujui
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          setSelectedRequest(request);
                          handleApproveReject(request.id, 'rejected');
                        }}
                        className="flex-1"
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Tolak
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Approval Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Setujui Permintaan</DialogTitle>
              <DialogDescription>
                Tambahkan catatan untuk peminjaman ini (opsional)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Catatan</Label>
                <Textarea
                  placeholder="Contoh: Harap kembalikan tepat waktu"
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setApprovalNotes('');
                }}
              >
                Batal
              </Button>
              <Button
                onClick={() => selectedRequest && handleApproveReject(selectedRequest.id, 'approved')}
              >
                Setujui
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Requests;