<script setup lang="ts">
import { computed } from 'vue'
import { Task, TaskTypeValue } from '@/models/dpia.ts'

// Check if this is a task group
const isTaskGroup = computed(() => props.task.type.includes('task_group'))

// Helper to check if task has a specific type
const hasType = (typeToCheck: TaskTypeValue): boolean => {
  return props.task.type.includes(typeToCheck)
}

// Format type display
const formatType = (type: string): string => {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
const props = defineProps<{
  task: Task
}>()
</script>

<template>
  <div class="task" :class="{ 'task-group': isTaskGroup }">
    <div class="task-header">
      <h3 class="task-title">{{ task.task }}</h3>
      <span class="task-urn">{{ task.urn }}</span>

      <div class="task-type-badges">
        <span v-for="type in task.type" :key="type" class="badge" :class="`badge-${type.replace('_', '-')}`">
          {{ formatType(type) }}
        </span>
      </div>
    </div>

    <p v-if="task.description" class="task-description">
      {{ task.description }}
    </p>

    <div v-if="task.category" class="task-category">Category: {{ task.category }}</div>

    <div v-if="task.repeatable" class="task-repeatable">
      <span class="repeatable-icon">🔄</span> This task is repeatable
    </div>

    <!-- Task Content based on type -->
    <div class="task-content">
      <!-- Open Text Input -->
      <div v-if="hasType('open_text')" class="task-open-text">
        <label :for="`text-${task.urn}`">Your response:</label>
        <textarea :id="`text-${task.urn}`" rows="4" placeholder="Enter your response here..."></textarea>
      </div>

      <!-- Date Input -->
      <div v-if="hasType('date')" class="task-date">
        <label :for="`date-${task.urn}`">Select date:</label>
        <input :id="`date-${task.urn}`" type="date" />
      </div>

      <!-- Select Option -->
      <div v-if="hasType('select_option') && task.options?.length" class="task-select">
        <label :for="`select-${task.urn}`">Select an option:</label>
        <select :id="`select-${task.urn}`">
          <option value="" disabled selected>-- Select an option --</option>
          <option v-for="option in task.options" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
      </div>

      <!-- Upload Document -->
      <div v-if="hasType('upload_document')" class="task-upload">
        <label :for="`upload-${task.urn}`">Upload document:</label>
        <input :id="`upload-${task.urn}`" type="file" />
      </div>

      <!-- Sign Task -->
      <div v-if="hasType('sign_task')" class="task-sign">
        <div class="signature-area">
          <p>Signature required</p>
          <div class="signature-box">
            <!-- Signature component would go here -->
            <div class="signature-placeholder">Sign here</div>
          </div>
          <button class="sign-button">Sign Document</button>
        </div>
      </div>
    </div>

    <!-- Sources -->
    <div v-if="task.sources?.length" class="task-sources">
      <h4>Sources:</h4>
      <ul>
        <li v-for="source in task.sources" :key="source.source" class="source-item">
          <div class="source-link">{{ source.source }}</div>
          <div v-if="source.description" class="source-description">{{ source.description }}</div>
        </li>
      </ul>
    </div>

    <!-- Nested Tasks (recursively render child tasks) -->
    <div v-if="isTaskGroup && task.tasks?.length" class="nested-tasks">
      <h4>Subtasks:</h4>
      <TaskView v-for="childTask in task.tasks" :key="childTask.urn" :task="childTask" class="child-task" />
    </div>
  </div>
</template>

<style scoped>
.task {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
  background-color: #fafafa;
}

.task-group {
  border-left: 4px solid #4a6cf7;
}

.task-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.task-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  flex: 1;
}

.task-urn {
  font-size: 0.8rem;
  color: #666;
  padding: 2px 6px;
  background: #eee;
  border-radius: 4px;
}

.task-type-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
  width: 100%;
}

.badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  color: white;
}

.badge-task-group {
  background-color: #4a6cf7;
}

.badge-open-text {
  background-color: #38b2ac;
}

.badge-date {
  background-color: #805ad5;
}

.badge-select-option {
  background-color: #dd6b20;
}

.badge-upload-document {
  background-color: #3182ce;
}

.badge-sign-task {
  background-color: #e53e3e;
}

.task-description {
  margin-bottom: 16px;
  color: #333;
  line-height: 1.5;
}

.task-category {
  margin-bottom: 8px;
  color: #666;
  font-size: 0.9rem;
}

.task-repeatable {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 12px;
}

.task-content {
  margin: 16px 0;
}

.task-open-text textarea,
.task-select select,
.task-date input,
.task-upload input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-top: 4px;
}

.signature-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.signature-box {
  border: 1px dashed #999;
  width: 100%;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f9f9f9;
}

.signature-placeholder {
  color: #999;
  font-style: italic;
}

.sign-button {
  background-color: #e53e3e;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.task-sources {
  margin-top: 16px;
  border-top: 1px solid #eee;
  padding-top: 12px;
}

.task-sources h4 {
  margin-top: 0;
  margin-bottom: 8px;
  font-size: 1rem;
}

.source-item {
  margin-bottom: 8px;
}

.source-link {
  color: #4a6cf7;
  font-weight: 500;
}

.source-description {
  font-size: 0.9rem;
  color: #666;
  margin-top: 2px;
}

.nested-tasks {
  margin-top: 16px;
  border-top: 1px solid #eee;
  padding-top: 12px;
}

.nested-tasks h4 {
  margin-top: 0;
  margin-bottom: 12px;
  font-size: 1rem;
}

.child-task {
  margin-left: 16px;
}
</style>
