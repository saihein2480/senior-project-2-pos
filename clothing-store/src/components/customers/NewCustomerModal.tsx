"use client";

import { useState, useEffect } from "react";
import { X, User, Phone, MapPin, Upload, Tag } from "lucide-react";
import { CreateCustomerRequest, Customer } from "@/types/customer";

interface NewCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (customerData: CreateCustomerRequest) => Promise<void>;
  customer?: Customer; // Optional customer for editing
}

export default function NewCustomerModal({
  isOpen,
  onClose,
  onSubmit,
  customer,
}: NewCustomerModalProps) {
  const [formData, setFormData] = useState<CreateCustomerRequest>({
    email: "",
    displayName: "",
    customerType: "retailer",
    phone: "",
    address: "",
    secondaryPhone: "",
    township: "",
    city: "",
    customerImage: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Populate form data when editing a customer
  useEffect(() => {
    if (customer) {
      setFormData({
        email: customer.email,
        displayName: customer.displayName || "",
        customerType: customer.customerType || "retailer",
        phone: customer.phone || "",
        address: customer.address || "",
        secondaryPhone: customer.secondaryPhone || "",
        township: customer.township || "",
        city: customer.city || "",
        customerImage: customer.customerImage || "",
      });

      // Set image preview if customer has an image
      if (customer.customerImage) {
        setImagePreview(customer.customerImage);
      }
    } else {
      // Reset form for new customer
      setFormData({
        email: "",
        displayName: "",
        customerType: "retailer",
        phone: "",
        address: "",
        secondaryPhone: "",
        township: "",
        city: "",
        customerImage: "",
      });
      setImagePreview(null);
      setSelectedFile(null);
    }
  }, [customer, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const customerData = { ...formData };

      // Upload image to Cloudinary if a file is selected
      if (selectedFile) {
        setIsUploading(true);
        const uploadFormData = new FormData();
        uploadFormData.append("file", selectedFile);
        uploadFormData.append("type", "customer");

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: uploadFormData,
        });

        if (uploadResponse.ok) {
          const uploadResult = await uploadResponse.json();
          customerData.customerImage = uploadResult.data.url;
        } else {
          throw new Error("Failed to upload image");
        }
        setIsUploading(false);
      }

      await onSubmit(customerData);
      setFormData({
        email: "",
        displayName: "",
        customerType: "retailer",
        phone: "",
        address: "",
        secondaryPhone: "",
        township: "",
        city: "",
        customerImage: "",
      });
      setSelectedFile(null);
      setImagePreview(null);
      onClose();
    } catch (error) {
      console.error("Error creating customer:", error);
      setIsUploading(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = [
        "image/png",
        "image/jpg",
        "image/jpeg",
        "image/gif",
        "image/webp",
      ];
      if (!validTypes.includes(file.type)) {
        alert("Please select a valid image file (PNG, JPG, JPEG, GIF, WebP)");
        return;
      }

      // Validate file size (5MB limit)
      const maxSize = 5 * 1024 * 1024; // 5MB in bytes
      if (file.size > maxSize) {
        alert("File size must be less than 5MB");
        return;
      }

      setSelectedFile(file);

      // Create preview only
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-gray-600" />
              <h2 className="text-xl font-semibold text-gray-900">
                {customer ? "Edit Customer" : "New Customer Entry"}
              </h2>
            </div>
            <button
              aria-label="Close modal"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Customer Image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Image
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                {imagePreview ? (
                  <div className="relative inline-block">
                    <img
                      src={imagePreview}
                      alt="Customer preview"
                      className="w-24 h-24 object-cover rounded-full mx-auto mb-2 border-2 border-gray-200"
                    />
                    <button
                      aria-label="Remove image"
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow-sm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <p className="text-sm text-gray-600 mt-2">
                      {selectedFile?.name}
                    </p>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 mb-2">
                      Drag & drop image here.
                    </p>
                    <input
                      type="file"
                      id="customerImage"
                      accept="image/png,image/jpg,image/jpeg,image/gif,image/webp"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <label
                      htmlFor="customerImage"
                      className="inline-flex items-center px-3 py-1 border border-blue-300 rounded-md text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      Select File
                    </label>
                    <p className="text-xs text-gray-400 mt-1">
                      PNG, JPG, JPEG, GIF, WebP up to 5MB
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {/* Row 1: Name and Customer Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="displayName"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      id="displayName"
                      name="displayName"
                      value={formData.displayName}
                      onChange={handleChange}
                      required
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      placeholder="Enter customer name"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="customerType"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Customer Type *
                  </label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <select
                      id="customerType"
                      name="customerType"
                      value={formData.customerType}
                      onChange={handleChange}
                      required
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white text-gray-900"
                    >
                      <option value="">Select Type</option>
                      <option value="retailer">Retailer</option>
                      <option value="wholesaler">Wholesaler</option>
                      <option value="distributor">Distributor</option>
                      <option value="individual">Individual</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Row 2: Phone Numbers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Primary Phone Number *
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      required
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      placeholder="Enter primary phone number"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="secondaryPhone"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Phone Number (Optional)
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="tel"
                      id="secondaryPhone"
                      name="secondaryPhone"
                      value={formData.secondaryPhone}
                      onChange={handleChange}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      placeholder="Enter secondary phone number"
                    />
                  </div>
                </div>
              </div>

              {/* Row 3: Full Address */}
              <div>
                <label
                  htmlFor="address"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Full Address
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <textarea
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    rows={2}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900"
                    placeholder="Enter full address"
                  />
                </div>
              </div>

              {/* Row 4: Township and City */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="township"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Township
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      id="township"
                      name="township"
                      value={formData.township}
                      onChange={handleChange}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      placeholder="Enter township"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="city"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    City
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      id="city"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      placeholder="Enter city"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isUploading}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <User className="h-4 w-4 mr-1" />
                {isUploading
                  ? "Uploading Image..."
                  : isSubmitting
                  ? customer
                    ? "Updating..."
                    : "Creating..."
                  : customer
                  ? "Update Customer"
                  : "Save Customer"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
