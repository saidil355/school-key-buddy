import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { KeyRound, Users, Clock, CheckCircle, AlertCircle, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const Dashboard = () => {
  const { userRole, profile } = useAuth();
  const [stats, setStats] = useState({
    totalItems: 0,
    availableItems: 0,
    borrowedItems: 0,
    overdueItems: 0,
    pendingRequests: 0,
    myActiveRequests: 0,
  });
  const [recentRequests, setRecentRequests] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
    fetchRecentRequests();

    // Setup realtime subscriptions
    const itemsChannel = supabase
      .channel('items-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
        fetchStats();
      })
      .subscribe();

    const requestsChannel = supabase
      .channel('requests-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'borrowing_requests' }, () => {
        fetchStats();
        fetchRecentRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(requestsChannel);
    };
  }, [profile?.id]);

  const fetchStats = async () => {
    // Fetch items stats
    const { data: items } = await supabase.from('items').select('status');
    
    const totalItems = items?.length || 0;
    const availableItems = items?.filter(i => i.status === 'tersedia').length || 0;
    const borrowedItems = items?.filter(i => i.status === 'dipinjam').length || 0;
    const overdueItems = items?.filter(i => i.status === 'overdue').length || 0;

    // Fetch requests stats
    const { data: requests } = await supabase
      .from('borrowing_requests')
      .select('status, borrower_id');

    const pendingRequests = requests?.filter(r => r.status === 'pending').length || 0;
    const myActiveRequests = requests?.filter(
      r => r.borrower_id === profile?.id && ['pending', 'approved'].includes(r.status)
    ).length || 0;

    setStats({
      totalItems,
      availableItems,
      borrowedItems,
      overdueItems,
      pendingRequests,
      myActiveRequests,
    });
  };

  const fetchRecentRequests = async () => {
    let query = supabase
      .from('borrowing_requests')
      .select(`
        *,
        items(name, type, room_name),
        profiles!borrowing_requests_borrower_id_fkey(full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (userRole === 'siswa') {
      query = query.eq('borrower_id', profile?.id);
    }

    const { data } = await query;
    setRecentRequests(data || []);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      pending: { variant: 'secondary', label: 'Pending' },
      approved: { variant: 'default', label: 'Disetujui' },
      rejected: { variant: 'destructive', label: 'Ditolak' },
      returned: { variant: 'outline', label: 'Dikembalikan' },
    };

    const config = variants[status] || { variant: 'secondary', label: status };
    return <Badge variant={config.variant as any}>{config.label}</Badge>;
  };

  return (
    <DashboardLayout currentPage="/dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Selamat datang, {profile?.full_name}!
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Item</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalItems}</div>
              <p className="text-xs text-muted-foreground">Kunci & Infokus</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tersedia</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{stats.availableItems}</div>
              <p className="text-xs text-muted-foreground">Siap dipinjam</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Dipinjam</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{stats.borrowedItems}</div>
              <p className="text-xs text-muted-foreground">Sedang digunakan</p>
            </CardContent>
          </Card>

          {stats.overdueItems > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Terlambat</CardTitle>
                <AlertCircle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{stats.overdueItems}</div>
                <p className="text-xs text-muted-foreground">Perlu perhatian</p>
              </CardContent>
            </Card>
          )}

          {(userRole === 'admin' || userRole === 'guru') && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Perlu Approval</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.pendingRequests}</div>
                <p className="text-xs text-muted-foreground">Permintaan masuk</p>
              </CardContent>
            </Card>
          )}

          {userRole === 'siswa' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Peminjaman Saya</CardTitle>
                <KeyRound className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.myActiveRequests}</div>
                <p className="text-xs text-muted-foreground">Aktif</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Requests */}
        <Card>
          <CardHeader>
            <CardTitle>Aktivitas Terbaru</CardTitle>
            <CardDescription>Permintaan peminjaman terbaru</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Belum ada aktivitas
                </p>
              ) : (
                recentRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between border-b pb-3 last:border-0"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {request.items?.name} - {request.items?.room_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {request.profiles?.full_name} • {request.purpose}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      {getStatusBadge(request.status)}
                      <p className="text-xs text-muted-foreground">
                        {new Date(request.requested_at).toLocaleDateString('id-ID')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;