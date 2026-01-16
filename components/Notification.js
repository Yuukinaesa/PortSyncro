// components/Notification.js
import Modal from './Modal';
import { useLanguage } from '../lib/languageContext';

export default function Notification({ notification, onClose }) {
  const { t } = useLanguage();

  if (!notification || !notification.isOpen) return null;

  const handleConfirm = () => {
    if (notification.onConfirm) {
      notification.onConfirm();
    } else {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={notification.isOpen}
      onClose={onClose}
      title={notification.title}
      type={notification.type}
    >
      <p className="mb-6 text-gray-300 leading-relaxed font-sans">
        {notification.message}
      </p>
      <div className="flex justify-end">
        <button
          onClick={handleConfirm}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-blue-900/20"
        >
          {notification.confirmText || t('ok')}
        </button>
      </div>
    </Modal>
  );
}