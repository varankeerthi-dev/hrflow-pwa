import React, { useState } from 'react'
import { sendMessage } from '../../hooks/useMessages'

export default function ChatInput({ taskId, user }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async (e) => {
    e?.preventDefault()
    if (!text.trim()) return
    setLoading(true)
    await sendMessage(taskId, { text, userId: user?.uid, userName: user?.name || user?.email || 'User' })
    setText('')
    setLoading(false)
  }

  return (
    <form onSubmit={handleSend} className="flex items-center gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        placeholder="Type a message..."
      />
      <button
        type="submit"
        disabled={loading}
        className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        Send
      </button>
    </form>
  )
}
