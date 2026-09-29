export function isPostSupportedBy(post, userId) {
  return Boolean(userId && Array.isArray(post?.supporterIds) && post.supporterIds.includes(userId))
}

export function normalizeReplyText(value) {
  return String(value || '').trim()
}

export function validateReplyText(value) {
  const text = normalizeReplyText(value)
  if (!text) return 'Write a reply before sending.'
  if (text.length > 2000) return 'Replies must be 2,000 characters or fewer.'
  return ''
}
