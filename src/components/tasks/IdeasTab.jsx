import React from 'react'
import { relativeTime } from '../../utils/taskHelpers'

export default function IdeasTab({ ideas = [], onNew, onEdit, onDelete, onQuickAdd }) {
  const handleInline = async (e) => {
    e.preventDefault()
    const val = e.target.elements?.inlineIdea?.value?.trim()
    if (val) {
      await onQuickAdd(val)
      e.target.reset()
    }
  }
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Ideas</h3>
          <p className="text-sm text-gray-500">Personal ideas only you can see.</p>
        </div>
        <button onClick={onNew} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm">New Idea</button>
      </div>
      <form className="mb-4 flex flex-col sm:flex-row gap-2" onSubmit={handleInline}>
        <textarea
          name="inlineIdea"
          placeholder="Quick capture... (type and hit Save idea)"
          className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm"
          rows={2}
        />
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm whitespace-nowrap">Save idea</button>
      </form>
      {ideas.length === 0 ? (
        <p className="text-sm text-gray-500">No ideas yet. Capture your thoughts here!</p>
      ) : (
        <div className="space-y-3">
          {ideas.map(idea => (
            <div key={idea.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-800">{idea.text}</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => onEdit(idea)} className="text-xs text-gray-500 hover:text-gray-700">✏️</button>
                  <button onClick={() => onDelete(idea.id)} className="text-xs text-red-500 hover:text-red-600">🗑️</button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {idea.tags?.map(tag => (
                  <span key={tag} className="text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{tag}</span>
                ))}
                <span className="text-[11px] text-gray-500">{relativeTime(idea.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
