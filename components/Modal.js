// components/Modal.js
import { useEffect } from 'react';
import { FiX } from 'react-icons/fi';

export default function Modal({ isOpen, onClose, title, children, type = 'info' }) {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      document.body.classList.add('modal-open');
      // Add additional body styling to minimize visual gaps
      document.body.style.position = 'relative';
      document.body.style.height = '100vh';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
      document.body.classList.remove('modal-open');
      document.body.style.position = '';
      document.body.style.height = '';
    };
  }, [isOpen, onClose]);

  // Determine border color based on type
  const getBorderColor = () => {
    switch(type) {
      case 'success': return 'border-green-200 dark:border-green-800';
      case 'error': return 'border-red-200 dark:border-red-800';
      case 'warning': return 'border-amber-200 dark:border-amber-800';
      default: return 'border-blue-200 dark:border-blue-800';
    }
  };

  // Determine background color based on type
  const getBgColor = () => {
    switch(type) {
      case 'success': return 'bg-green-50 dark:bg-green-900/20';
      case 'error': return 'bg-red-50 dark:bg-red-900/20';
      case 'warning': return 'bg-amber-50 dark:bg-amber-900/20';
      default: return 'bg-blue-50 dark:bg-blue-900/20';
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4" 
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        width: '100vw', 
        height: '100vh',
        minHeight: '100vh'
      }}
      onClick={onClose}
    >
      {/* Subtle backdrop with gentle blur */}
      <div 
        className="absolute inset-0 bg-white/10 dark:bg-black/10 backdrop-blur-sm transition-all duration-300"
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          width: '100%', 
          height: '100%'
        }}
      />
      
      {/* Modal */}
      <div 
        className={`relative w-full max-w-lg sm:max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border ${getBorderColor()} animate-modal-in z-[10000]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200 dark:hover:text-gray-300 dark:hover:bg-gray-800"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}