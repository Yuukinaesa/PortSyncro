// components/Notification.js
import Modal from './Modal';

export default function Notification({ notification, onClose }) {
  if (!notification || !notification.isOpen) return null;
  
  return (
    <Modal
      isOpen={notification.isOpen}
      onClose={onClose}
      title={notification.title}
      type={notification.type}
    >
      <p className="mb-6 text-gray-700 dark:text-gray-300 leading-relaxed">
        {notification.message}
      </p>
      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-all duration-200"
        >
          Tutup
        </button>
      </div>
    </Modal>
  );
}