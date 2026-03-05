import { useEffect, useState } from 'react'
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, FileText } from 'lucide-react'

/**
 * ImageViewer – full-screen lightbox
 * Props:
 *   docs   : Array<{ name: string, url: string, type?: string }>
 *   index  : number  (initial index to show)
 *   onClose: function
 */
export default function ImageViewer({ docs = [], index = 0, onClose }) {
    const [current, setCurrent] = useState(index)
    const [zoom, setZoom] = useState(1)

    const doc = docs[current]
    const isImage = doc?.type?.startsWith('image') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(doc?.url || '')

    // Keyboard navigation
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowRight') setCurrent(c => Math.min(c + 1, docs.length - 1))
            if (e.key === 'ArrowLeft') setCurrent(c => Math.max(c - 1, 0))
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [docs.length, onClose])

    // Reset zoom when navigating
    useEffect(() => setZoom(1), [current])

    if (!doc) return null

    return (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex flex-col" onClick={onClose}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 bg-black/60 z-10 shrink-0" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                    <span className="text-white font-semibold text-sm truncate max-w-[200px]">{doc.name}</span>
                    <span className="text-gray-400 text-xs">{current + 1} / {docs.length}</span>
                </div>
                <div className="flex items-center gap-2">
                    {isImage && (
                        <>
                            <button
                                onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all"
                                title="Zoom out"
                            >
                                <ZoomOut size={16} />
                            </button>
                            <span className="text-white text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
                            <button
                                onClick={() => setZoom(z => Math.min(4, z + 0.25))}
                                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all"
                                title="Zoom in"
                            >
                                <ZoomIn size={16} />
                            </button>
                        </>
                    )}
                    <a
                        href={doc.url}
                        download={doc.name}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all"
                        title="Download"
                        onClick={e => e.stopPropagation()}
                    >
                        <Download size={16} />
                    </a>
                    <button
                        onClick={e => { e.stopPropagation(); onClose() }}
                        className="p-2 rounded-lg bg-white/10 hover:bg-red-500/60 text-white transition-all"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex items-center justify-center overflow-hidden relative" onClick={e => e.stopPropagation()}>
                {/* Prev */}
                {current > 0 && (
                    <button
                        onClick={() => setCurrent(c => c - 1)}
                        className="absolute left-4 z-10 p-3 bg-black/40 hover:bg-black/70 text-white rounded-full transition-all"
                    >
                        <ChevronLeft size={22} />
                    </button>
                )}

                {/* Main content */}
                {isImage ? (
                    <img
                        src={doc.url}
                        alt={doc.name}
                        style={{ transform: `scale(${zoom})`, transition: 'transform 0.2s', maxHeight: '85vh', maxWidth: '90vw', objectFit: 'contain' }}
                        className="rounded shadow-2xl select-none"
                        draggable={false}
                    />
                ) : (
                    <div className="flex flex-col items-center gap-4 text-white">
                        <FileText size={64} className="text-gray-400" />
                        <p className="text-lg font-semibold">{doc.name}</p>
                        <a
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-6 py-3 bg-white text-gray-900 font-bold rounded-xl hover:bg-gray-100 transition-all flex items-center gap-2"
                        >
                            <Download size={18} /> Open / Download
                        </a>
                    </div>
                )}

                {/* Next */}
                {current < docs.length - 1 && (
                    <button
                        onClick={() => setCurrent(c => c + 1)}
                        className="absolute right-4 z-10 p-3 bg-black/40 hover:bg-black/70 text-white rounded-full transition-all"
                    >
                        <ChevronRight size={22} />
                    </button>
                )}
            </div>

            {/* Thumbnail strip */}
            {docs.length > 1 && (
                <div className="flex items-center justify-center gap-2 py-3 bg-black/60 px-4 overflow-x-auto shrink-0" onClick={e => e.stopPropagation()}>
                    {docs.map((d, i) => {
                        const isImg = d.type?.startsWith('image') || /\.(png|jpg|jpeg|gif|webp)$/i.test(d.url || '')
                        return (
                            <button
                                key={i}
                                onClick={() => setCurrent(i)}
                                className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${i === current ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-90'}`}
                            >
                                {isImg ? (
                                    <img src={d.url} alt={d.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                                        <FileText size={18} className="text-gray-300" />
                                    </div>
                                )}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
