import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { KeyRound, Plus, Search, Package, Clock, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface Item {
  id: string;
  name: string;
  type: string;
  room_name: string;
  status: string;
  condition_notes?: string;
  created_at: string;
}

const Items = () => {
  const { userRole } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [borrowDialogOpen, setBorrowDialogOpen] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  useEffect(() => {
    fetchItems();

    // Setup realtime subscription
    const channel = supabase
      .channel('items-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
        fetchItems();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    filterItems();
  }, [searchQuery, filterStatus, filterType, items]);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Gagal memuat data item');
      console.error(error);
    } else {
      setItems(data || []);
    }
    setLoading(false);
  };

  const filterItems = () => {
    let filtered = items;

    if (searchQuery) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.room_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(item => item.status === filterStatus);
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(item => item.type === filterType);
    }

    setFilteredItems(filtered);
  };

  const handleBorrowRequest = async () => {
    if (!selectedItem || !purpose || !startTime || !endTime) {
      toast.error('Mohon lengkapi semua field');
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { error: requestError } = await supabase
      .from('borrowing_requests')
      .insert({
        item_id: selectedItem.id,
        borrower_id: userData.user.id,
        purpose,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
      });

    if (requestError) {
      toast.error('Gagal membuat permintaan');
      console.error(requestError);
      return;
    }

    // Log activity
    await supabase.from('activity_logs').insert({
      request_id: (await supabase.from('borrowing_requests').select('id').order('created_at', { ascending: false }).limit(1).single()).data?.id,
      action: 'request',
      performed_by: userData.user.id,
      notes: `Mengajukan peminjaman ${selectedItem.name}`,
    });

    toast.success('Permintaan peminjaman berhasil dibuat');
    setBorrowDialogOpen(false);
    setPurpose('');
    setStartTime('');
    setEndTime('');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'tersedia':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'dipinjam':
        return <Clock className="h-4 w-4 text-warning" />;
      case 'overdue':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'rusak':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      tersedia: { variant: 'default', label: 'Tersedia' },
      dipinjam: { variant: 'secondary', label: 'Dipinjam' },
      overdue: { variant: 'destructive', label: 'Overdue' },
      rusak: { variant: 'destructive', label: 'Rusak' },
    };

    const config = variants[status] || { variant: 'secondary', label: status };
    return <Badge variant={config.variant as any}>{config.label}</Badge>;
  };

  return (
    <DashboardLayout currentPage="/items">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Daftar Item</h2>
            <p className="text-muted-foreground">Kelola kunci dan infokus sekolah</p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filter & Pencarian</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Cari</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Nama item atau ruangan..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="tersedia">Tersedia</SelectItem>
                    <SelectItem value="dipinjam">Dipinjam</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="rusak">Rusak</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipe</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Tipe</SelectItem>
                    <SelectItem value="kunci">Kunci</SelectItem>
                    <SelectItem value="infokus">Infokus</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <p className="col-span-full text-center text-muted-foreground py-8">Memuat data...</p>
          ) : filteredItems.length === 0 ? (
            <p className="col-span-full text-center text-muted-foreground py-8">Tidak ada item ditemukan</p>
          ) : (
            filteredItems.map((item) => (
              <Card key={item.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{item.name}</CardTitle>
                    </div>
                    {getStatusIcon(item.status)}
                  </div>
                  <CardDescription>{item.room_name}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tipe:</span>
                    <Badge variant="outline" className="capitalize">{item.type}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    {getStatusBadge(item.status)}
                  </div>
                  {item.condition_notes && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Catatan: {item.condition_notes}
                    </p>
                  )}
                  {item.status === 'tersedia' && (
                    <Dialog open={borrowDialogOpen && selectedItem?.id === item.id} onOpenChange={(open) => {
                      setBorrowDialogOpen(open);
                      if (open) setSelectedItem(item);
                    }}>
                      <DialogTrigger asChild>
                        <Button className="w-full mt-2">
                          <Clock className="mr-2 h-4 w-4" />
                          Pinjam
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Pinjam {item.name}</DialogTitle>
                          <DialogDescription>
                            Isi detail peminjaman untuk {item.room_name}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Tujuan Peminjaman</Label>
                            <Textarea
                              placeholder="Contoh: Kuliah Pemrograman Web"
                              value={purpose}
                              onChange={(e) => setPurpose(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Waktu Mulai</Label>
                            <Input
                              type="datetime-local"
                              value={startTime}
                              onChange={(e) => setStartTime(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Waktu Selesai</Label>
                            <Input
                              type="datetime-local"
                              value={endTime}
                              onChange={(e) => setEndTime(e.target.value)}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={handleBorrowRequest}>
                            Ajukan Peminjaman
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Items;