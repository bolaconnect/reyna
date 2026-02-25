import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
    currentPage: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
}

export function Pagination({
    currentPage,
    totalItems,
    pageSize,
    onPageChange,
    onPageSizeChange,
}: PaginationProps) {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalItems);

    const pageSizeOptions = [20, 50, 100, 200];

    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        const delta = 1;
        const left = currentPage - delta;
        const right = currentPage + delta;

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= left && i <= right)) {
                pages.push(i);
            } else if (pages[pages.length - 1] !== '...') {
                pages.push('...');
            }
        }
        return pages;
    };

    return (
        <div className="flex items-center gap-4 text-[10.5px] text-gray-400 font-medium">
            {/* Page Size Selector */}
            <div className="flex items-center scale-95 origin-right">
                <select
                    value={pageSize}
                    onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    className="bg-transparent border-none focus:ring-0 cursor-pointer text-gray-400 hover:text-gray-900 transition-colors"
                >
                    {pageSizeOptions.map((opt) => (
                        <option key={opt} value={opt}>
                            {opt}
                        </option>
                    ))}
                </select>
            </div>

            {/* Range Info */}
            <div className="min-w-[60px] text-right">
                {startItem}-{endItem} <span className="text-gray-300">/</span> <span className="text-gray-600">{totalItems}</span>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-0.5">
                <button
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1}
                    className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    title="First page"
                >
                    <ChevronsLeft size={13} />
                </button>
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    title="Previous page"
                >
                    <ChevronLeft size={13} />
                </button>

                {/* Page Numbers */}
                <div className="flex items-center gap-0.5 mx-0.5">
                    {getPageNumbers().map((p, idx) => (
                        p === '...' ? (
                            <span key={`ellipsis-${idx}`} className="px-0.5 text-gray-200">...</span>
                        ) : (
                            <button
                                key={p}
                                onClick={() => onPageChange(Number(p))}
                                className={`w-6 h-6 flex items-center justify-center rounded-md transition-all ${currentPage === p
                                    ? 'bg-gray-900 text-white'
                                    : 'hover:bg-gray-100 text-gray-500'
                                    }`}
                            >
                                {p}
                            </button>
                        )
                    ))}
                </div>

                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    title="Next page"
                >
                    <ChevronRight size={13} />
                </button>
                <button
                    onClick={() => onPageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    title="Last page"
                >
                    <ChevronsRight size={13} />
                </button>
            </div>
        </div>
    );
}
