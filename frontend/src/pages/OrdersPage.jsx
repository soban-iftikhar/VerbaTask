import { useMemo, useState } from 'react';
import {
 useReactTable,
 getCoreRowModel,
 getSortedRowModel,
 getFilteredRowModel,
} from '@tanstack/react-table';
import {
  Search,
  AlertCircle,
  X,
  Plus,
  Trash2,
  Receipt,
} from 'lucide-react';
import { toast } from 'sonner';

import { Card } from '../components/ui/Card';
import { Table } from '../components/ui/Table';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { useOrders, useCreateOrder } from '../hooks/useOrders';
import { useInventory } from '../hooks/useInventory';
import { formatPKR, formatDate, formatQuantity } from '../lib/format';

const PAYMENT_METHODS = ['easypaisa', 'jazzcash', 'bank', 'cash'];

const STATUS_TABS = [
 { id: 'all', label: 'All' },
 { id: 'completed', label: 'Completed' },
 { id: 'pending_approval', label: 'Pending Approval' },
 { id: 'rejected', label: 'Rejected' },
];

function NewOrderModal({ isOpen, onClose }) {
 const { data: inventory } = useInventory();
 const createOrder = useCreateOrder();

 const [paymentMethod, setPaymentMethod] = useState('cash');
 const [items, setItems] = useState([
 { inventoryItemId: '', name: '', quantity: 1, price: 0 },
 ]);

 const inventoryMap = useMemo(() => {
 const map = new Map();
 (inventory || []).forEach((item) => map.set(item._id, item));
 return map;
 }, [inventory]);

 const updateItem = (idx, updates) => {
 setItems((prev) => {
 const next = [...prev];
 next[idx] = { ...next[idx], ...updates };
 return next;
 });
 };

 const handleSelectItem = (idx, inventoryItemId) => {
 const item = inventoryMap.get(inventoryItemId);
 updateItem(idx, {
 inventoryItemId,
 name: item?.name || '',
 price: item?.price || 0,
 });
 };

 const addLine = () => {
 setItems((prev) => [...prev, { inventoryItemId: '', name: '', quantity: 1, price: 0 }]);
 };

 const removeLine = (idx) => {
 setItems((prev) => prev.filter((_, i) => i !== idx));
 };

 const total = items.reduce((sum, i) => sum + (i.price || 0) * (Number(i.quantity) || 0), 0);

 const handleSubmit = async (e) => {
 e.preventDefault();
 const validItems = items.filter((i) => i.inventoryItemId && Number(i.quantity) > 0);
 if (!validItems.length) {
 toast.error('Add at least one item');
 return;
 }

 try {
 await createOrder.mutateAsync({
 items: validItems.map((i) => ({
 inventoryItemId: i.inventoryItemId,
 name: i.name,
 quantity: Number(i.quantity),
 price: i.price,
 })),
 total,
 paymentMethod,
 source: 'dashboard',
 });
 toast.success('Order created');
 setItems([{ inventoryItemId: '', name: '', quantity: 1, price: 0 }]);
 setPaymentMethod('cash');
 onClose();
 } catch (err) {
 toast.error(err.message || 'Failed to create order');
 }
 };

 return (
 <Modal
 isOpen={isOpen}
 onClose={onClose}
 title="New order"
 description="Create an order directly from the dashboard."
 maxWidth="max-w-xl"
 >
  <form onSubmit={handleSubmit} className="space-y-4">
    {/* Column Headers */}
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-mute px-1">
      <span className="flex-1">Select Item</span>
      <span className="w-20 shrink-0 text-center">Qty</span>
      <span className="w-24 shrink-0 text-right">Subtotal</span>
      {items.length > 1 && <span className="w-8 shrink-0" />}
    </div>

    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <select
              value={item.inventoryItemId}
              onChange={(e) => handleSelectItem(idx, e.target.value)}
              className="w-full h-10 px-3 text-sm font-medium bg-canvas text-ink border border-hairline-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary truncate cursor-pointer shadow-xs"
              required
            >
              <option value="" disabled>
                Select an item from inventory...
              </option>
              {(inventory || []).map((inv) => (
                <option key={inv._id} value={inv._id} className="bg-canvas text-ink py-1">
                  {inv.name} ({formatQuantity(inv.quantity, inv.unit)} in stock • {formatPKR(inv.price)})
                </option>
              ))}
            </select>
          </div>

          <div className="w-20 shrink-0">
            <input
              type="number"
              min="1"
              value={item.quantity}
              onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
              className="w-full h-10 px-2 text-center text-sm font-tabular font-semibold bg-canvas text-ink border border-hairline-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-xs"
              placeholder="Qty"
              required
            />
          </div>

          <div className="w-24 shrink-0 text-sm text-ink font-semibold font-tabular text-right truncate">
            {formatPKR((item.price || 0) * (Number(item.quantity) || 0))}
          </div>

          {items.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-ruby hover:text-ruby hover:bg-ruby/10 w-8 h-10 p-0 shrink-0 flex items-center justify-center rounded-lg"
              onClick={() => removeLine(idx)}
              title="Remove item"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      ))}
    </div>

    <Button
      type="button"
      variant="outline"
      size="sm"
      leftIcon={<Plus className="w-4 h-4" />}
      onClick={addLine}
    >
      Add item
    </Button>

    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-hairline">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-ink-secondary">Payment method</label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className="h-10 px-3 text-sm font-medium bg-canvas text-ink border border-hairline-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer shadow-xs"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m} className="bg-canvas text-ink">
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <Card padding="sm" className="bg-canvas-soft flex flex-col justify-center">
        <p className="text-[11px] text-ink-mute uppercase tracking-wider font-semibold">Total</p>
        <p className="text-lg font-semibold text-ink font-tabular">{formatPKR(total)}</p>
      </Card>
    </div>

 <div className="flex justify-end gap-2 pt-2">
 <Button type="button" variant="ghost" onClick={onClose} disabled={createOrder.isPending}>
 Cancel
 </Button>
 <Button type="submit" loading={createOrder.isPending}>
 Create order
 </Button>
 </div>
 </form>
 </Modal>
 );
}

export function OrdersPage() {
 const { data: orders, isLoading, error } = useOrders();
 const [search, setSearch] = useState('');
 const [statusFilter, setStatusFilter] = useState('all');
 const [selectedOrder, setSelectedOrder] = useState(null);
 const [newOrderOpen, setNewOrderOpen] = useState(false);

 const counts = useMemo(() => {
 const list = orders || [];
 return {
 all: list.length,
 completed: list.filter((o) => o.status === 'completed' || o.status === 'approved').length,
 pending_approval: list.filter((o) => o.status === 'pending_approval').length,
 rejected: list.filter((o) => o.status === 'rejected').length,
 };
 }, [orders]);

 const filteredOrders = useMemo(() => {
 if (!orders) return [];
 if (statusFilter === 'all') return orders;
 if (statusFilter === 'completed') {
 return orders.filter((o) => o.status === 'completed' || o.status === 'approved');
 }
 return orders.filter((o) => o.status === statusFilter);
 }, [orders, statusFilter]);

 const totalRevenue = useMemo(() => {
 return (orders || []).reduce((sum, o) => sum + (o.total || 0), 0);
 }, [orders]);

 const paymentBadges = {
 cash: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
 easypaisa: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
 jazzcash: 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
 bank: 'bg-sky-50 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800',
 };

 const columns = useMemo(
 () => [
 {
 accessorKey: 'createdAt',
 header: 'Date',
 cell: ({ getValue }) => (
 <span className="text-xs text-ink-secondary whitespace-nowrap">
 {formatDate(getValue())}
 </span>
 ),
 },
 {
 accessorKey: 'items',
 header: 'Items',
 cell: ({ getValue }) => {
 const items = getValue() || [];
 const count = items.length;
 const summary = items.map((i) => `${i.name} x${i.quantity}`).join(', ');
 return (
 <div className="flex items-center gap-2 max-w-[260px]">
 <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-medium shrink-0">
 {count} {count === 1 ? 'item' : 'items'}
 </span>
 <span className="truncate text-ink text-xs" title={summary}>
 {summary || '-'}
 </span>
 </div>
 );
 },
 },
 {
 accessorKey: 'total',
 header: 'Total',
 cell: ({ getValue }) => (
 <span className="font-tabular font-medium text-emerald-600 dark:text-emerald-400">
 {formatPKR(getValue())}
 </span>
 ),
 },
 {
 accessorKey: 'paymentMethod',
 header: 'Payment',
 cell: ({ getValue }) => {
 const key = (getValue() || 'cash').toLowerCase();
 const badgeClass = paymentBadges[key] || paymentBadges.cash;
 return (
 <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border capitalize ${badgeClass}`}>
 {key}
 </span>
 );
 },
 },
 {
 accessorKey: 'source',
 header: 'Source',
 cell: ({ getValue }) => <Badge variant={getValue()} dot>{getValue()}</Badge>,
 },
 {
 accessorKey: 'status',
 header: 'Status',
 cell: ({ getValue }) => <Badge variant={getValue()} dot>{getValue()}</Badge>,
 },
 ],
 []
 );

 const table = useReactTable({
 data: filteredOrders,
 columns,
 state: { globalFilter: search },
 onGlobalFilterChange: setSearch,
 getCoreRowModel: getCoreRowModel(),
 getSortedRowModel: getSortedRowModel(),
 getFilteredRowModel: getFilteredRowModel(),
 initialState: { sorting: [{ id: 'createdAt', desc: true }] },
 });

 if (error) {
 return (
 <div className="space-y-6">
 <div>
 <h2 className="text-xl font-light text-ink tracking-tight">Orders</h2>
 <p className="text-xs text-ink-mute">Review transactions and order history</p>
 </div>
 <Card padding="lg" className="text-center py-12">
 <AlertCircle className="w-10 h-10 text-ruby mx-auto mb-3" />
 <h3 className="text-base font-medium text-ink">Failed to load orders</h3>
 <p className="text-xs text-ink-mute mt-1">{error.message}</p>
 </Card>
 </div>
 );
 }

 const tabColors = {
 all: 'bg-sky-600 text-white',
 completed: 'bg-emerald-600 text-white',
 pending_approval: 'bg-amber-600 text-white',
 rejected: 'bg-red-600 text-white',
 };

 return (
 <div className="space-y-6">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div>
 <h2 className="font-heading text-2xl font-light tracking-[-0.5px] text-ink">Orders</h2>
 <p className="font-body text-sm text-ink-mute">Review transactions and order history</p>
 </div>
 <Button
 leftIcon={<Plus className="w-4 h-4" />}
 onClick={() => setNewOrderOpen(true)}
 className="shadow-sm shadow-primary/25"
 >
 New order
 </Button>
 </div>

 {/* KPI Cards for Orders - Solid Colors, Glassmorphism & High Contrast */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
 <div className="p-4 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950 flex items-center justify-between shadow-card hover:shadow-md transition-all duration-200">
 <div>
 <p className="text-xs uppercase tracking-wider font-medium text-sky-700 dark:text-sky-300">Total Volume</p>
 <p className="text-2xl font-light text-sky-950 dark:text-sky-50 font-tabular mt-1">{formatPKR(totalRevenue)}</p>
 </div>
 <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-700 flex items-center justify-center ">
 <Receipt className="w-5 h-5" />
 </div>
 </div>
 <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 flex items-center justify-between shadow-card hover:shadow-md transition-all duration-200">
 <div>
 <p className="text-xs uppercase tracking-wider font-medium text-emerald-700 dark:text-emerald-300">Total Orders</p>
 <p className="text-2xl font-light text-emerald-950 dark:text-emerald-50 font-tabular mt-1">{counts.all}</p>
 </div>
 <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 flex items-center justify-center ">
 <Receipt className="w-5 h-5" />
 </div>
 </div>
 <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 flex items-center justify-between shadow-card hover:shadow-md transition-all duration-200">
 <div>
 <p className="text-xs uppercase tracking-wider font-medium text-emerald-700 dark:text-emerald-300">Completed</p>
 <p className="text-2xl font-light font-tabular mt-1 text-emerald-950 dark:text-emerald-50">{counts.completed}</p>
 </div>
 <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 flex items-center justify-center ">
 <Receipt className="w-5 h-5" />
 </div>
 </div>
 <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 flex items-center justify-between shadow-card hover:shadow-md transition-all duration-200">
 <div>
 <p className="text-xs uppercase tracking-wider font-medium text-amber-800 dark:text-amber-300">Pending Review</p>
 <p className="text-2xl font-light font-tabular mt-1 text-amber-950 dark:text-amber-50">{counts.pending_approval}</p>
 </div>
 <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700 flex items-center justify-center ">
 <AlertCircle className="w-5 h-5" />
 </div>
 </div>
 </div>

 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 {/* Status Filter Tabs (Segmented controls) */}
 <div className="flex items-center gap-1.5 p-1 bg-canvas-soft dark:bg-canvas-soft border border-hairline rounded-lg overflow-x-auto">
 {STATUS_TABS.map((tab) => {
 const active = statusFilter === tab.id;
 const activeStyle = tabColors[tab.id] || 'bg-sky-600 text-white';
 return (
 <button
 key={tab.id}
 type="button"
 onClick={() => setStatusFilter(tab.id)}
 className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
 active
 ? `${activeStyle} shadow-xs`
 : 'text-ink-secondary hover:text-ink hover:bg-canvas'
 }`}
 >
 <span>{tab.label}</span>
 <span
 className={`text-[10px] px-1.5 py-0.5 rounded-md font-tabular ${
 active ? 'bg-white/20 text-white' : 'bg-canvas border border-hairline text-ink-mute'
 }`}
 >
 {counts[tab.id] ?? 0}
 </span>
 </button>
 );
 })}
 </div>

 {/* Search */}
 <div className="relative w-full sm:w-auto sm:min-w-[220px]">
 <Search className="w-4 h-4 text-ink-mute absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
 <input
 type="text"
 placeholder="Search orders..."
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="w-full bg-canvas dark:bg-canvas border border-hairline rounded-lg pl-9 pr-3 text-xs text-ink placeholder:text-ink-mute/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary h-9 transition-colors"
 />
 </div>
 </div>

 {isLoading ? (
 <div className="space-y-2">
 <Skeleton variant="tableRow" />
 <Skeleton variant="tableRow" />
 <Skeleton variant="tableRow" />
 </div>
 ) : filteredOrders.length === 0 && !search ? (
 <Card padding="lg">
 <EmptyState
 icon={<Receipt className="w-6 h-6" />}
 title={statusFilter === 'all' ? 'No orders recorded yet' : `No ${statusFilter.replace('_', ' ')} orders`}
 description={
 statusFilter === 'all'
 ? 'Orders placed via WhatsApp voice, guided chat, or dashboard will appear here.'
 : `There are currently no orders in ${statusFilter.replace('_', ' ')} status.`
 }
 actionLabel={statusFilter === 'all' ? 'New order' : undefined}
 actionIcon={statusFilter === 'all' ? <Plus className="w-4 h-4" /> : undefined}
 onAction={statusFilter === 'all' ? () => setNewOrderOpen(true) : undefined}
 />
 </Card>
 ) : (
 <Table
 table={table}
 onRowClick={(order) => setSelectedOrder(order)}
 emptyText="No matching orders found"
 />
 )}

 <NewOrderModal isOpen={newOrderOpen} onClose={() => setNewOrderOpen(false)} />

 <Modal
 isOpen={!!selectedOrder}
 onClose={() => setSelectedOrder(null)}
 title="Order details"
 maxWidth="max-w-lg"
 >
 {selectedOrder && (
 <div className="space-y-5">
 <div className="grid grid-cols-2 gap-4">
 <Card padding="sm" className="bg-canvas-soft">
 <p className="text-[11px] text-ink-mute uppercase tracking-wider">Total</p>
 <p className="text-lg font-light text-ink font-tabular">{formatPKR(selectedOrder.total)}</p>
 </Card>
 <Card padding="sm" className="bg-canvas-soft">
 <p className="text-[11px] text-ink-mute uppercase tracking-wider">Status</p>
 <div className="mt-1">
 <Badge variant={selectedOrder.status}>{selectedOrder.status}</Badge>
 </div>
 </Card>
 </div>

 <div className="space-y-3">
 <div className="flex items-center justify-between text-sm">
 <span className="text-ink-secondary">Payment method</span>
 <span className="capitalize text-ink font-medium">{selectedOrder.paymentMethod}</span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-ink-secondary">Source</span>
 <Badge variant={selectedOrder.source}>{selectedOrder.source}</Badge>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-ink-secondary">Created</span>
 <span className="text-ink font-medium">{formatDate(selectedOrder.createdAt)}</span>
 </div>
 </div>

 <div>
 <p className="text-xs font-medium text-ink-secondary mb-2">Items</p>
 <ul className="divide-y divide-hairline border border-hairline rounded-lg">
 {(selectedOrder.items || []).map((item, idx) => (
 <li key={idx} className="px-4 py-3 flex items-center justify-between">
 <div>
 <p className="text-sm text-ink">{item.name}</p>
 <p className="text-[11px] text-ink-mute">
 {formatPKR(item.price)} each
 </p>
 </div>
 <div className="text-right">
 <p className="text-sm text-ink font-tabular">{formatQuantity(item.quantity)}</p>
 <p className="text-[11px] text-ink-mute">
 {formatPKR((item.price || 0) * item.quantity)}
 </p>
 </div>
 </li>
 ))}
 </ul>
 </div>

 <div className="flex justify-end pt-2">
 <Button variant="outline" onClick={() => setSelectedOrder(null)} leftIcon={<X className="w-4 h-4" />}>
 Close
 </Button>
 </div>
 </div>
 )}
 </Modal>
 </div>
 );
}
