const functions = require('firebase-functions')
const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp()
}

exports.cleanupOldTasks = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const db = admin.firestore()
    
    // Calculate 50 days ago
    const fiftyDaysAgo = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 50 * 24 * 60 * 60 * 1000)
    )
    
    console.log('Starting cleanup of tasks completed before:', fiftyDaysAgo.toDate())
    
    const oldTasks = await db.collection('tasks')
      .where('status', '==', 'completed')
      .where('completedAt', '<', fiftyDaysAgo)
      .get()
    
    if (oldTasks.empty) {
      console.log('No old tasks to delete')
      return null
    }
    
    console.log(`Found ${oldTasks.size} tasks to delete`)
    
    const deletePromises = oldTasks.docs.map(async (taskDoc) => {
      const taskId = taskDoc.id
      
      try {
        // Delete all messages
        const messages = await db.collection(`tasks/${taskId}/messages`).get()
        const batch = db.batch()
        messages.docs.forEach(m => batch.delete(m.ref))
        batch.delete(taskDoc.ref)
        await batch.commit()
        
        console.log(`Deleted task ${taskId} and ${messages.size} messages`)
      } catch (error) {
        console.error(`Error deleting task ${taskId}:`, error)
      }
    })
    
    await Promise.all(deletePromises)
    console.log(`Cleanup complete. Deleted ${oldTasks.size} tasks.`)
    return null
  })
