/**
 * Service for managing user sessions, tasks, and edit states
 */
export class StorageService {
    constructor() {
        this.userSessions = new Map();  // { chatId: { data, lastActivity } }
        this.taskStore = new Map();     // { taskId: { taskData, created } }
        this.editStates = new Map();    // { chatId: { editState, lastActivity } }
        
        // Configuration
        this.sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
        this.editTimeout = 15 * 60 * 1000;         // 15 minutes
        this.maxTasksPerUser = 20;                 // Maximum tasks per user
        
        // Start cleanup interval
        this.startCleanupInterval();
    }
    
    /**
     * Starts an interval to clean up expired sessions, tasks, and edit states
     * @private
     */
    startCleanupInterval() {
        // Run cleanup every hour
        setInterval(() => {
            this.cleanupExpiredData();
        }, 60 * 60 * 1000);
    }
    
    /**
     * Cleans up expired sessions, tasks, and edit states
     * @private
     */
    cleanupExpiredData() {
        const now = Date.now();
        
        // Clean up expired sessions
        for (const [chatId, session] of this.userSessions.entries()) {
            if (now - session.lastActivity > this.sessionTimeout) {
                this.userSessions.delete(chatId);
                console.log(`[Storage] Expired session for chat ${chatId}`);
            }
        }
        
        // Clean up expired tasks
        for (const [taskId, task] of this.taskStore.entries()) {
            if (now - task.created > this.sessionTimeout) {
                this.taskStore.delete(taskId);
                console.log(`[Storage] Expired task ${taskId}`);
            }
        }
        
        // Clean up expired edit states
        for (const [chatId, state] of this.editStates.entries()) {
            if (now - state.lastActivity > this.editTimeout) {
                this.editStates.delete(chatId);
                console.log(`[Storage] Expired edit state for chat ${chatId}`);
            }
        }
    }

    /**
     * Gets a user session by chat ID
     * @param {string|number} chatId - The chat ID
     * @returns {Object} - The session data
     */
    getSession(chatId) {
        const sessionWrapper = this.userSessions.get(chatId);
        if (!sessionWrapper) return {};
        
        // Update last activity
        sessionWrapper.lastActivity = Date.now();
        return sessionWrapper.data || {};
    }

    /**
     * Updates a user session with new data
     * @param {string|number} chatId - The chat ID
     * @param {Object} updates - The data to update
     */
    updateSession(chatId, updates) {
        const sessionWrapper = this.userSessions.get(chatId);
        const now = Date.now();
        
        if (sessionWrapper) {
            // Update existing session
            sessionWrapper.data = { ...sessionWrapper.data, ...updates };
            sessionWrapper.lastActivity = now;
        } else {
            // Create new session
            this.userSessions.set(chatId, {
                data: updates,
                lastActivity: now
            });
        }
    }

    /**
     * Creates a new task
     * @param {Object} taskData - The task data
     * @param {string|number} [chatId] - Optional chat ID for task limits
     * @returns {Object} - The created task with ID
     */
    createTask(taskData, chatId) {
        // Check task limit per user if chatId is provided
        if (chatId) {
            const userTaskCount = this.countUserTasks(chatId);
            if (userTaskCount >= this.maxTasksPerUser) {
                // Delete oldest task for this user
                this.deleteOldestUserTask(chatId);
            }
        }
        
        const taskId = generateTaskId();
        const task = { ...taskData, taskId };
        
        // Store task with creation timestamp
        this.taskStore.set(taskId, {
            data: task,
            created: Date.now(),
            chatId: chatId || null
        });
        
        return task;
    }

    /**
     * Gets a task by ID
     * @param {string} taskId - The task ID
     * @returns {Object|null} - The task or null if not found
     */
    getTask(taskId) {
        const taskWrapper = this.taskStore.get(taskId);
        
        // Check if task exists
        if (!taskWrapper) {
            console.log(`[Storage] Task ${taskId} not found`);
            return null;
        }
        
        // Check if task has expired
        const now = Date.now();
        if (now - taskWrapper.created > this.sessionTimeout) {
            console.log(`[Storage] Task ${taskId} has expired`);
            this.taskStore.delete(taskId);
            return null;
        }
        
        return taskWrapper.data;
    }

    /**
     * Updates a task by ID
     * @param {string} taskId - The task ID
     * @param {Object} updates - The updates to apply to the task
     * @returns {boolean} - Whether the update was successful
     */
    updateTask(taskId, updates) {
        const taskWrapper = this.taskStore.get(taskId);
        if (!taskWrapper) {
            console.log(`[Storage] Cannot update task ${taskId}: not found`);
            return false;
        }
        
        // Update task data
        taskWrapper.data = { ...taskWrapper.data, ...updates };
        console.log(`[Storage] Updated task ${taskId}`);
        return true;
    }

    /**
     * Deletes a task by ID
     * @param {string} taskId - The task ID
     * @returns {boolean} - Whether the deletion was successful
     */
    deleteTask(taskId) {
        if (!this.taskStore.has(taskId)) {
            console.log(`[Storage] Cannot delete task ${taskId}: not found`);
            return false;
        }
        
        this.taskStore.delete(taskId);
        console.log(`[Storage] Deleted task ${taskId}`);
        return true;
    }
    
    /**
     * Counts the number of tasks for a specific user
     * @param {string|number} chatId - The chat ID
     * @returns {number} - The number of tasks
     * @private
     */
    countUserTasks(chatId) {
        let count = 0;
        for (const task of this.taskStore.values()) {
            if (task.chatId === chatId) {
                count++;
            }
        }
        return count;
    }
    
    /**
     * Deletes the oldest task for a specific user
     * @param {string|number} chatId - The chat ID
     * @private
     */
    deleteOldestUserTask(chatId) {
        let oldestTaskId = null;
        let oldestTime = Infinity;
        
        for (const [taskId, task] of this.taskStore.entries()) {
            if (task.chatId === chatId && task.created < oldestTime) {
                oldestTaskId = taskId;
                oldestTime = task.created;
            }
        }
        
        if (oldestTaskId) {
            this.deleteTask(oldestTaskId);
            console.log(`[Storage] Deleted oldest task ${oldestTaskId} for chat ${chatId}`);
        }
    }

    /**
     * Gets the edit state for a chat
     * @param {string|number} chatId - The chat ID
     * @returns {Object|null} - The edit state or null if not found
     */
    getEditState(chatId) {
        const stateWrapper = this.editStates.get(chatId);
        if (!stateWrapper) return null;
        
        // Check if edit state has expired
        const now = Date.now();
        if (now - stateWrapper.lastActivity > this.editTimeout) {
            this.clearEditState(chatId);
            console.log(`[StorageService] Edit state expired for chat ${chatId}`);
            return null;
        }
        
        // Update last activity and return state
        stateWrapper.lastActivity = now;
        console.log(`[StorageService] getEditState(${chatId}):`, stateWrapper.state);
        return stateWrapper.state;
    }

    /**
     * Sets the edit state for a chat
     * @param {string|number} chatId - The chat ID
     * @param {Object} state - The edit state
     */
    setEditState(chatId, state) {
        console.log(`[StorageService] setEditState(${chatId}):`, state);
        this.editStates.set(chatId, {
            state,
            lastActivity: Date.now()
        });
    }

    /**
     * Clears the edit state for a chat
     * @param {string|number} chatId - The chat ID
     */
    clearEditState(chatId) {
        console.log(`[StorageService] clearEditState(${chatId})`);
        this.editStates.delete(chatId);
    }
}

function generateTaskId() {
    return Math.random().toString(36).substring(2, 10);
}
