"use client";

import { toast } from 'react-hot-toast';
import { useState, useEffect } from "react";
import { X, User, Phone, MapPin, Upload, Tag } from "lucide-react";
import { CreateCustomerRequest, Customer } from "@/types/customer";
import { useLanguage } from "@/contexts/LanguageContext";

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
  const { t } = useLanguage();
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
        toast.error(t.selectValidImageFile);
        return;
      }

      // Validate file size (5MB limit)
      const maxSize = 5 * 1024 * 1024; // 5MB in bytes
      if (file.size > maxSize) {
        toast.error(t.fileSizeMustBeLessThan5MB);
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-gray-600" />
              <h2 className="text-xl font-semibold text-gray-900">
                {customer ? t.editCustomer : t.newCustomerEntry}
              </h2>
            </div>
            <button
              aria-label={t.closeModal}
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden px-6 py-4">
          <form onSubmit={handleSubmit} className="h-full flex flex-col">
            {/* Main Content Grid */}
            <div className="grid grid-cols-12 gap-4">
              {/* Left Side - Customer Image */}
              <div className="col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t.customerImage}
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center hover:border-gray-400 transition-colors h-[200px] flex flex-col items-center justify-center">
                  {imagePreview ? (
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt={t.customerPreview}
                        className="w-20 h-20 object-cover rounded-full border-2 border-gray-200"
                      />
                      <button
                        aria-label={t.removeImage}
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow-sm"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <p className="text-xs text-gray-600 mt-2 truncate max-w-[100px]">
                        {selectedFile?.name}
                      </p>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-gray-400 mb-2" />
                      <input
                        type="file"
                        id="customerImage"
                        accept="image/png,image/jpg,image/jpeg,image/gif,image/webp"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <label
                        htmlFor="customerImage"
                        className="inline-flex items-center px-2 py-1 border-0 rounded-md text-xs text-white bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 shadow-sm transition-colors cursor-pointer"
                      >
                        <Upload className="h-3 w-3 mr-1" />
                        {t.select}
                      </label>
                      <p className="text-xs text-gray-400 mt-1">
                        {t.upTo5MB}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Right Side - Form Fields */}
              <div className="col-span-9 space-y-3">
                {/* Row 1: Name and Customer Type */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                      {t.name} *
                    </label>
                    <div className="relative">
                      <User className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        id="displayName"
                        name="displayName"
                        value={formData.displayName}
                        onChange={handleChange}
                        required
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-gray-900 text-sm"
                        placeholder={t.enterCustomerName}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="customerType" className="block text-sm font-medium text-gray-700 mb-1">
                      {t.customerType} *
                    </label>
                    <div className="relative">
                      <Tag className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                      <select
                        id="customerType"
                        name="customerType"
                        value={formData.customerType}
                        onChange={handleChange}
                        required
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent appearance-none bg-white text-gray-900 text-sm"
                      >
                        <option value="">{t.selectType}</option>
                        <option value="retailer">{t.retailer}</option>
                        <option value="wholesaler">{t.wholesaler}</option>
                        <option value="distributor">{t.distributor}</option>
                        <option value="individual">{t.individual}</option>
                        <option value="other">{t.other}</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Row 2: Phone Numbers */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                      {t.primaryPhoneNumber} *
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        required
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-gray-900 text-sm"
                        placeholder={t.enterPrimaryPhoneNumber}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="secondaryPhone" className="block text-sm font-medium text-gray-700 mb-1">
                      {t.phoneNumber} ({t.optional})
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="tel"
                        id="secondaryPhone"
                        name="secondaryPhone"
                        value={formData.secondaryPhone}
                        onChange={handleChange}
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-gray-900 text-sm"
                        placeholder={t.enterSecondaryPhoneNumber}
                      />
                    </div>
                  </div>
                </div>

                {/* Row 3: Full Address */}
                <div>
                  <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                    {t.fullAddress}
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    <textarea
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      rows={2}
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent resize-none text-gray-900 text-sm"
                      placeholder={t.enterFullAddress}
                    />
                  </div>
                </div>

                {/* Row 4: Township and City */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="township" className="block text-sm font-medium text-gray-700 mb-1">
                      {t.township}
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        id="township"
                        name="township"
                        value={formData.township}
                        onChange={handleChange}
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-gray-900 text-sm"
                        placeholder={t.enterTownship}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                      {t.city}
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        id="city"
                        name="city"
                        value={formData.city}
                        onChange={handleChange}
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-gray-900 text-sm"
                        placeholder={t.enterCity}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex-shrink-0 flex justify-end space-x-3 pt-4 mt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors text-sm"
              >
                <X className="h-4 w-4 mr-1" />
                {t.clear}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isUploading}
                className="flex items-center px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm shadow-md border-0"
              >
                <User className="h-4 w-4 mr-1" />
                {isUploading
                  ? t.uploadingImage
                  : isSubmitting
                  ? customer
                    ? t.updating
                    : t.creating
                  : customer
                  ? t.updateCustomer
                  : t.saveCustomer}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
