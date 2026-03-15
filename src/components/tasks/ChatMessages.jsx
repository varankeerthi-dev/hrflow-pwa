import React, { useEffect, useRef } from 'react'
import { relativeTime } from '../../utils/taskHelpers'

export default function ChatMessages({ messages = [] }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="h-full overflow-y-auto space-y-3 pr-1">
      {messages.map(msg => (
        <div key={msg.id} className="bg-gray-50 border border-gray-100 rounded-lg p-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">{msg.userName || 'User'}</span>
            <span className="text-[11px] text-gray-500">{relativeTime(msg.timestamp)}</span>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{msg.text}</p>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
