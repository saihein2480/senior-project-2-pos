"use client";

import { AlertTriangle, X } from "lucide-react";
import { Customer } from "@/types/customer";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  customer: Customer | null;
  isDeleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmationModal({
  isOpen,
  customer,
  isDeleting,
  error,
  onConfirm,
  onCancel,
}: DeleteConfirmationModalProps) {
  if (!isOpen || !customer) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 z-0 backdrop-blur-md transition-all duration-300"
          onClick={onCancel}
        ></div>

        {/* Modal panel */}
        <div className="relative z-10 inline-block align-bottom bg-white bg-opacity-95 backdrop-blur-md rounded-xl text-left overflow-hidden shadow-2xl transform transition-all duration-300 sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-white border-opacity-20">
          <div className="bg-white bg-opacity-90 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Delete Customer
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    Are you sure you want to delete{" "}
                    <span className="font-semibold text-gray-700">
                      {customer.displayName || customer.email}
                    </span>
                    ? This action cannot be undone and will permanently remove all customer data.
                  </p>
                  {customer.totalSpent && customer.totalSpent > 0 && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <p className="text-sm text-yellow-800">
                        <strong>Warning:</strong> This customer has purchase history with a total spent of{" "}
                        <span className="font-semibold">
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD'
                          }).format(customer.totalSpent)}
                        </span>
                      </p>
                    </div>
                  )}
                  {customer.receivables && customer.receivables > 0 && (
                    <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-md">
                      <p className="text-sm text-orange-800">
                        <strong>Outstanding Receivables:</strong>{" "}
                        <span className="font-semibold">
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD'
                          }).format(customer.receivables)}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
                {error && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="bg-gray-50 bg-opacity-90 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {isDeleting ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Deleting...
                </div>
              ) : (
                "Delete Customer"
              )}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isDeleting}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
