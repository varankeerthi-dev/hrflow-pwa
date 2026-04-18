import React, { createContext, useState, useContext, useEffect } from 'react'

const SidebarContext = createContext()

export function SidebarProvider({ children }) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isAutoCollapsed, setIsAutoCollapsed] = useState(false)

  const toggleSidebar = () => {
    setIsCollapsed(prev => !prev)
    setIsAutoCollapsed(false) // Manual toggle resets auto-collapse
  }

  const setCollapsed = (val) => {
    setIsCollapsed(val)
  }

  return (
    <SidebarContext.Provider value={{ 
      isCollapsed, 
      setIsCollapsed: setCollapsed, 
      toggleSidebar,
      isAutoCollapsed,
      setIsAutoCollapsed
    }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}
