import { useState } from 'react';
import { SnapshotService } from '../services/snapshotService';
import { useAuth } from '../../contexts/AuthContext';
import { Database, Zap, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function AdminSnapshotTool() {
    const { user } = useAuth();
    const [loading, setLoading] = useState<string | null>(null);

    const handleBuild = async (collection: 'cards' | 'emails') => {
        if (!user) return;
        setLoading(collection);
        try {
            await SnapshotService.buildSnapshots(collection, user.uid);
            toast.success(`Đã đóng gói snapshots cho ${collection} thành công!`);
        } catch (err) {
            console.error(err);
            toast.error(`Lỗi khi đóng gói ${collection}`);
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="bg-amber-50 rounded-2xl border border-amber-100 p-5 space-y-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                    <Database size={20} className="text-amber-600" />
                </div>
                <div>
                    <h3 className="text-[15px] font-bold text-amber-900">Công cụ tối ưu hóa dữ liệu (Snapshot)</h3>
                    <p className="text-[12px] text-amber-700/70">
                        Nén dữ liệu thành các gói lớn (Mega-Docs) giúp lần đầu đăng nhập tải cực nhanh.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                    onClick={() => handleBuild('cards')}
                    disabled={!!loading}
                    className="flex items-center justify-between p-3 bg-white border border-amber-200 rounded-xl hover:shadow-md transition-all group disabled:opacity-50"
                >
                    <div className="flex items-center gap-2">
                        <Zap size={16} className="text-amber-500" />
                        <span className="text-[13px] font-semibold text-gray-700">Đóng gói Cards</span>
                    </div>
                    {loading === 'cards' ? (
                        <Loader2 size={16} className="animate-spin text-amber-600" />
                    ) : (
                        <CheckCircle2 size={16} className="text-gray-300 group-hover:text-amber-500 transition-colors" />
                    )}
                </button>

                <button
                    onClick={() => handleBuild('emails')}
                    disabled={!!loading}
                    className="flex items-center justify-between p-3 bg-white border border-amber-200 rounded-xl hover:shadow-md transition-all group disabled:opacity-50"
                >
                    <div className="flex items-center gap-2">
                        <Zap size={16} className="text-amber-500" />
                        <span className="text-[13px] font-semibold text-gray-700">Đóng gói Emails</span>
                    </div>
                    {loading === 'emails' ? (
                        <Loader2 size={16} className="animate-spin text-amber-600" />
                    ) : (
                        <CheckCircle2 size={16} className="text-gray-300 group-hover:text-amber-500 transition-colors" />
                    )}
                </button>
            </div>

            <div className="flex items-start gap-2 text-[11px] text-amber-600/80 bg-white/50 p-2.5 rounded-lg border border-amber-100/50">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <p>
                    <b>Lưu ý:</b> Việc đóng gói tốn một lượng Read lớn vì phải quét toàn bộ dữ liệu.
                    Bạn chỉ nên thực hiện sau khi vừa Import một lượng lớn dữ liệu (vài nghìn dòng).
                </p>
            </div>
        </div>
    );
}
