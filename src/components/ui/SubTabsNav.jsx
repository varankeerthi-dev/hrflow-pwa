import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * @typedef {Object} SubTabItem
 * @property {string} id
 * @property {string} label
 * @property {string} [path]
 */

/**
 * @param {Object} props
 * @param {SubTabItem[]} props.tabs
 * @param {string} [props.activeTabId]
 * @param {function(SubTabItem): void} [props.onTabChange]
 * @param {string} [props.className]
 */
export const SubTabsNav = ({
  tabs,
  activeTabId,
  onTabChange,
  className = '',
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  const currentTabId =
    activeTabId ||
    tabs.find((t) => t.path && (location.pathname === t.path || location.pathname.startsWith(t.path)))?.id ||
    tabs[0]?.id;

  return (
    <div
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        fontSynthesis: 'none',
        gap: '8px',
        MozOsxFontSmoothing: 'grayscale',
        WebkitFontSmoothing: 'antialiased',
        width: '100%',
        borderBottom: '1px solid #E5E7EB',
        marginBottom: '16px',
        paddingBottom: '4px',
      }}
      className={className}
    >
      <div
        style={{
          alignItems: 'center',
          boxSizing: 'border-box',
          display: 'flex',
          flexShrink: '0',
          gap: '8px',
          height: '36px',
          justifyContent: 'flex-start',
          padding: '3px',
          width: '100%',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {tabs.map((tab) => {
          const isActive = currentTabId === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (onTabChange) {
                  onTabChange(tab);
                } else if (tab.path) {
                  navigate(tab.path);
                }
              }}
              style={{
                alignItems: 'center',
                borderColor: '#00000000',
                borderRadius: '8px',
                borderStyle: 'solid',
                borderWidth: '0.888889px',
                boxSizing: 'border-box',
                display: 'flex',
                flexShrink: 0,
                gap: '6px',
                height: 'calc(100% - 1px)',
                justifyContent: 'center',
                paddingBlock: '2px',
                paddingInline: '10px',
                position: 'relative',
                background: 'transparent',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {tab.icon && (
                <span style={{ 
                  color: isActive ? '#16A34A' : '#0A0A0A99',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.15s ease'
                }}>
                  {tab.icon}
                </span>
              )}
              <div
                style={{
                  boxSizing: 'border-box',
                  color: isActive ? '#16A34A' : '#0A0A0A99',
                  display: 'flex',
                  flexShrink: '0',
                  fontFamily: '"Inter", system-ui, sans-serif',
                  fontSize: '14px',
                  fontWeight: isActive ? 600 : 500,
                  lineHeight: '142.857%',
                  textAlign: 'center',
                  width: 'max-content',
                  transition: 'color 0.15s ease',
                }}
              >
                {tab.label}
              </div>
              {isActive && (
                <div
                  style={{
                    backgroundColor: '#16A34A',
                    bottom: '-5px',
                    boxSizing: 'border-box',
                    height: '2px',
                    left: '0px',
                    position: 'absolute',
                    right: '0px',
                    width: '100%',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
