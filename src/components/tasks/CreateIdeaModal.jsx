import React, { useEffect, useState } from 'react'
import Modal from '../ui/Modal'

export default function CreateIdeaModal({ isOpen, onClose, onSave, idea }) {
  const [text, setText] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (idea) {
      setText(idea.text || '')
      setTags((idea.tags || []).join(','))
    } else {
      setText('')
      setTags('')
    }
  }, [idea])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!text.trim()) {
      setError('Idea text is required')
      return
    }
    const tagsArr = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []
    setError('')
    onSave({ text, tags: tagsArr })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={idea ? 'Edit Idea' : 'New Idea'} size="lg">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
          rows={6}
          placeholder="What's on your mind?"
          required
        />
        <div>
          <label className="text-xs text-gray-500">Tags (comma separated)</label>
          <input value={tags} onChange={e => setTags(e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="strategy, product, client" />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-md">Cancel</button>
          <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md">{idea ? 'Update' : 'Save'}</button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
