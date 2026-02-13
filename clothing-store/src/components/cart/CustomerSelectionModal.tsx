'use client';

import React, { useState, useEffect } from 'react';
import { X, Search, User, Users } from 'lucide-react';
import { Customer } from '@/types/customer';
import { SelectedCustomer } from '@/types/cart';

interface CustomerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCustomer: (customer: SelectedCustomer | null) => void;
  selectedCustomer: SelectedCustomer | null;
}

export function CustomerSelectionModal({
  isOpen,
  onClose,
  onSelectCustomer,
  selectedCustomer
}: CustomerSelectionModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch customers when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
    }
  }, [isOpen]);

  const fetchCustomers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/customers');
      const data = await response.json();
      
      if (data.success) {
        setCustomers(data.data || []);
      } else {
        setError(data.error || 'Failed to fetch customers');
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
      setError('Failed to fetch customers');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter customers based on search term
  const filteredCustomers = customers.filter(customer =>
    (customer.displayName?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (customer.phone?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleSelectCustomer = (customer: Customer) => {
    const selectedCustomerData: SelectedCustomer = {
      uid: customer.uid,
      email: customer.email,
      displayName: customer.displayName,
      customerImage: customer.customerImage,
      customerType: customer.customerType
    };
    onSelectCustomer(selectedCustomerData);
    onClose();
  };

  const handleSelectUnknown = () => {
    onSelectCustomer(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Users className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Select Customer</h2>
          </div>
          <button
            title="Close"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search customers by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Customer List */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Unknown Customer Option */}
          <div
            onClick={handleSelectUnknown}
            className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors mb-4 ${
              !selectedCustomer
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="flex-shrink-0 h-12 w-12">
              <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="h-6 w-6 text-gray-500" />
              </div>
            </div>
            <div className="ml-4 flex-1">
              <div className="text-sm font-medium text-gray-900">Unknown Customer</div>
              <div className="text-sm text-gray-500">Default customer for walk-in sales</div>
            </div>
            {!selectedCustomer && (
              <div className="flex-shrink-0">
                <div className="h-4 w-4 rounded-full bg-blue-500"></div>
              </div>
            )}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-8">
              <p className="text-red-600">{error}</p>
              <button
                onClick={fetchCustomers}
                className="mt-2 text-blue-600 hover:text-blue-800"
              >
                Try again
              </button>
            </div>
          )}

          {/* Customer List */}
          {!isLoading && !error && (
            <div className="space-y-2">
              {filteredCustomers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {searchTerm ? 'No customers found matching your search.' : 'No customers available.'}
                </div>
              ) : (
                filteredCustomers.map((customer) => (
                  <div
                    key={customer.uid}
                    onClick={() => handleSelectCustomer(customer)}
                    className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      selectedCustomer?.uid === customer.uid
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex-shrink-0 h-12 w-12">
                      {customer.customerImage ? (
                        <img
                          className="h-12 w-12 rounded-full object-cover border-2 border-gray-200"
                          src={customer.customerImage}
                          alt={customer.displayName || customer.email}
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                          <User className="h-6 w-6 text-gray-500" />
                        </div>
                      )}
                    </div>
                    <div className="ml-4 flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {customer.displayName || 'No Name'}
                      </div>
                      <div className="text-sm text-gray-500">{customer.email}</div>
                      {customer.phone && (
                        <div className="text-xs text-gray-400">{customer.phone}</div>
                      )}
                      {customer.customerType && (
                        <div className="mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {customer.customerType}
                          </span>
                        </div>
                      )}
                    </div>
                    {selectedCustomer?.uid === customer.uid && (
                      <div className="flex-shrink-0">
                        <div className="h-4 w-4 rounded-full bg-blue-500"></div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}