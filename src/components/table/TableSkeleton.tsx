import React from 'react';

interface TableSkeletonProps {
  columnsCount: number;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({ columnsCount }) => {
  return (
    <>
      {Array.from({ length: 8 }).map((_, rIdx) => (
        <tr
          key={rIdx}
          style={{
            height: '46px',
            borderBottom: '1px solid #F3F4F6',
          }}
        >
          {Array.from({ length: columnsCount }).map((_, cIdx) => (
            <td key={cIdx} style={{ padding: '12px 16px' }}>
              <div
                style={{
                  height: '14px',
                  backgroundColor: '#F3F4F6',
                  borderRadius: '4px',
                  width: cIdx === 0 ? '40%' : cIdx === 1 ? '70%' : '50%',
                  animation: 'shimmer 1.5s infinite linear',
                  backgroundImage: 'linear-gradient(90deg, #F3F4F6 0px, #EAEAEA 50px, #F3F4F6 100px)',
                  backgroundSize: '200px 100%',
                }}
              />
            </td>
          ))}
        </tr>
      ))}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -100px 0; }
          100% { background-position: 100px 0; }
        }
      `}</style>
    </>
  );
};
