import { useState, useEffect } from 'react';
import { User, Users, ChevronDown } from 'lucide-react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../firebase/config';

interface EmployeeSelectorProps {
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    currentUserId: string;
}

interface EmployeeRecord {
    uid: string;
    email: string;
}

export function EmployeeSelector({ selectedId, onSelect, currentUserId }: EmployeeSelectorProps) {
    const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        async function fetchEmployees() {
            setLoading(true);
            try {
                const q = query(collection(db, 'users'), limit(50));
                const snap = await getDocs(q);

                const list = snap.docs
                    .map(d => ({ uid: d.id, email: d.data().email || d.id }))
                    .filter(u => u.uid !== currentUserId);

                setEmployees(list);
            } catch (e) {
                console.warn('Failed to fetch employees list', e);
            } finally {
                setLoading(false);
            }
        }
        fetchEmployees();
    }, [currentUserId]);

    const selectedEmployee = employees.find(e => e.uid === selectedId);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 h-8 px-3 text-[12px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
                <Users size={14} className="text-gray-400" />
                <span className="max-w-[120px] truncate">
                    {selectedId ? (selectedEmployee?.email || 'Đang xem NV...') : 'Xem chính mình'}
                </span>
                <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
                    <div className="absolute top-full mt-1 left-0 w-64 bg-white border border-gray-100 rounded-xl shadow-2xl z-[70] overflow-hidden">
                        <div className="p-2 border-b border-gray-50 bg-gray-50/50">
                            <p className="text-[10px] uppercase font-bold text-gray-400">Chọn nhân viên để xem</p>
                        </div>

                        <div className="max-h-60 overflow-y-auto p-1">
                            <button
                                onClick={() => { onSelect(null); setOpen(false); }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] rounded-lg transition-colors ${!selectedId ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                <User size={14} />
                                <span>Xem chính mình</span>
                            </button>

                            <div className="h-px bg-gray-50 my-1" />

                            {employees.length === 0 && !loading && (
                                <div className="px-3 py-4 text-center">
                                    <p className="text-[11px] text-gray-400 italic">Chưa có danh sách nhân viên</p>
                                </div>
                            )}

                            {employees.map(emp => (
                                <button
                                    key={emp.uid}
                                    onClick={() => { onSelect(emp.uid); setOpen(false); }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] rounded-lg transition-colors ${selectedId === emp.uid ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <Users size={14} />
                                    <span className="truncate">{emp.email}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
