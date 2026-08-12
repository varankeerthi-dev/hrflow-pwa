import React, { createContext, useState, useContext, useCallback, useMemo } from 'react'

const SidebarContext = createContext()

export function SidebarProvider({ children }) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isAutoCollapsed, setIsAutoCollapsed] = useState(false)

  const toggleSidebar = useCallback(() => {
    setIsCollapsed(prev => !prev)
    setIsAutoCollapsed(false)
  }, [])

  const setCollapsed = useCallback((val) => {
    setIsCollapsed(val)
  }, [])

  const value = useMemo(() => ({
    isCollapsed,
    setIsCollapsed: setCollapsed,
    toggleSidebar,
    isAutoCollapsed,
    setIsAutoCollapsed
  }), [isCollapsed, setCollapsed, toggleSidebar, isAutoCollapsed])

  return (
    <SidebarContext.Provider value={value}>
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
