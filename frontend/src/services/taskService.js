import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

class TaskService {
  // Get all tasks for an agent
  async getTasks(agentId = 'Ray Richards') {
    try {
      const { data, error } = await supabase
        .from('user_tasks')
        .select('*')
        .eq('agent_id', agentId)
        .eq('is_completed', false)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Separate into urgent and queue
      const urgentTasks = data?.filter(task => task.section === 'urgent') || []
      const queueTasks = data?.filter(task => task.section === 'queue') || []

      return { urgentTasks, queueTasks }
    } catch (error) {
      console.error('Error fetching tasks:', error)
      return { urgentTasks: [], queueTasks: [] }
    }
  }

  // Create a new task
  async createTask(task, section, agentId = 'Ray Richards') {
    try {
      const { data, error } = await supabase
        .from('user_tasks')
        .insert({
          agent_id: agentId,
          section,
          title: task.title,
          description: task.description,
          context: task.context,
          contact: task.contact,
          phone: task.phone,
          time: task.time,
          type: task.type || (section === 'urgent' ? 'urgent' : 'callback'),
          priority: task.priority || (section === 'urgent' ? 'urgent' : 'normal'),
          actions: task.actions || [],
          created_by: task.created_by || 'voice_assistant'
        })
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error creating task:', error)
      return null
    }
  }

  // Update a task
  async updateTask(taskId, updates) {
    try {
      const { data, error } = await supabase
        .from('user_tasks')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error updating task:', error)
      return null
    }
  }

  // Move task between sections
  async moveTask(taskId, toSection) {
    try {
      const updates = {
        section: toSection,
        priority: toSection === 'urgent' ? 'urgent' : 'normal'
      }

      const { data, error } = await supabase
        .from('user_tasks')
        .update(updates)
        .eq('id', taskId)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error moving task:', error)
      return null
    }
  }

  // Delete a task
  async deleteTask(taskId) {
    try {
      const { error } = await supabase
        .from('user_tasks')
        .delete()
        .eq('id', taskId)

      if (error) throw error
      return true
    } catch (error) {
      console.error('Error deleting task:', error)
      return false
    }
  }

  // Mark task as completed
  async completeTask(taskId) {
    try {
      const { data, error } = await supabase
        .from('user_tasks')
        .update({ is_completed: true })
        .eq('id', taskId)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error completing task:', error)
      return null
    }
  }

  // Subscribe to real-time changes
  subscribeToTasks(agentId = 'Ray Richards', callback) {
    const subscription = supabase
      .channel('user_tasks_changes')
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_tasks',
          filter: `agent_id=eq.${agentId}`
        },
        (payload) => {
          console.log('Task change:', payload)
          callback(payload)
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }
}

export default new TaskService()