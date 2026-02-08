"use client";

import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { Button } from "@/components/ui/Button";
import { useState, useEffect, useRef } from "react";
import { 
  Plus, 
  QrCode, 
  RefreshCw,
  Save,
  X,
  Scan,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { ClothingInventoryItem } from "@/types/schemas";
import { InventoryService } from "@/services/InventoryService";
import { useCurrency } from "@/contexts/CurrencyContext";

interface NewStockForm {
  name: string;
  category: string;
  barcode: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  colors: string[];
  sizes: string[];
  description: string;
  supplier: string;
  imageUrl: string;
}

function NewStockContent() {
  const { user } = useAuth();
  const [activeMenuItem, setActiveMenuItem] = useState("new-stock");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<NewStockForm>({
    name: '',
    category: '',
    barcode: '',
    costPrice: 0,
    sellingPrice: 0,
    quantity: 0,
    colors: [],
    sizes: [],
    description: '',
    supplier: '',
    imageUrl: ''
  });
  
  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  
  // Barcode state
  const [isScanningBarcode, setIsScanningBarcode] = useState(false);
  const [isGeneratingBarcode, setIsGeneratingBarcode] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Color and size input state
  const [newColor, setNewColor] = useState('');
  const [newSize, setNewSize] = useState('');
  
  const { formatPrice } = useCurrency();

  // Predefined options
  const categories = [
    'Shirts', 'Pants', 'Dresses', 'Jackets', 'Shoes', 
    'Accessories', 'Underwear', 'Sportswear', 'Formal Wear'
  ];
  
  const commonSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36', '38', '40'];
  const commonColors = ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Purple', 'Gray', 'Brown'];

  // Generate random barcode
  const generateBarcode = () => {
    setIsGeneratingBarcode(true);
    // Generate a 13-digit EAN-13 barcode
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const barcode = (timestamp.slice(-10) + random).slice(0, 13);
    
    setTimeout(() => {
      setFormData(prev => ({ ...prev, barcode }));
      setIsGeneratingBarcode(false);
    }, 500);
  };

  // Start barcode scanning
  const startBarcodeScanning = async () => {
    try {
      setIsScanningBarcode(true);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Unable to access camera for barcode scanning');
      setIsScanningBarcode(false);
    }
  };

  // Stop barcode scanning
  const stopBarcodeScanning = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsScanningBarcode(false);
  };

  // Handle form input changes
  const handleInputChange = (
    field: keyof NewStockForm,
    value: string | number | string[]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error when user starts typing
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Add color
  const addColor = () => {
    if (newColor.trim() && !formData.colors.includes(newColor.trim())) {
      setFormData(prev => ({
        ...prev,
        colors: [...prev.colors, newColor.trim()]
      }));
      setNewColor('');
    }
  };

  // Remove color
  const removeColor = (color: string) => {
    setFormData(prev => ({
      ...prev,
      colors: prev.colors.filter(c => c !== color)
    }));
  };

  // Add size
  const addSize = () => {
    if (newSize.trim() && !formData.sizes.includes(newSize.trim())) {
      setFormData(prev => ({
        ...prev,
        sizes: [...prev.sizes, newSize.trim()]
      }));
      setNewSize('');
    }
  };

  // Remove size
  const removeSize = (size: string) => {
    setFormData(prev => ({
      ...prev,
      sizes: prev.sizes.filter(s => s !== size)
    }));
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!formData.name.trim()) errors.name = 'Product name is required';
    if (!formData.category) errors.category = 'Category is required';
    if (!formData.barcode.trim()) errors.barcode = 'Barcode is required';
    if (formData.costPrice <= 0) errors.costPrice = 'Cost price must be greater than 0';
    if (formData.sellingPrice <= 0) errors.sellingPrice = 'Selling price must be greater than 0';
    if (formData.quantity < 0) errors.quantity = 'Quantity cannot be negative';
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setError('Please fix the form errors before submitting');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const newItem: Omit<ClothingInventoryItem, 'id'> = {
        name: formData.name.trim(),
        category: formData.category,
        barcode: formData.barcode.trim(),
        price: formData.sellingPrice,
        stock: formData.quantity,
        colors: formData.colors,
        image: formData.imageUrl,
        wholesaleTiers: [],
        colorVariants: formData.colors.length > 0 ? formData.colors.map((color, index) => ({
          id: crypto.randomUUID(),
          color,
          colorCode: '',
          barcode: `${formData.barcode.trim()}-C${index + 1}`,
          sizeQuantities: formData.sizes.map(size => ({
            size,
            quantity: formData.quantity / formData.sizes.length
          }))
        })) : [],
        shop: user?.uid ?? "", // Add shop property, fallback to empty string if user.uid is undefined
        isNew: true // Add isNew property, default to true for new stock
      };
      
      if (!user?.uid) throw new Error("User ID is required to add stock item");
      await InventoryService.addClothingInventoryItem(newItem, user.uid);
      
      setSuccess('New stock item added successfully!');
      
      // Reset form
      setFormData({
        name: '',
        category: '',
        barcode: '',
        costPrice: 0,
        sellingPrice: 0,
        quantity: 0,
        colors: [],
        sizes: [],
        description: '',
        supplier: '',
        imageUrl: ''
      });
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
      
    } catch (err) {
      console.error('Error adding stock item:', err);
      setError('Failed to add stock item. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clear messages when component unmounts
  useEffect(() => {
    return () => {
      if (isScanningBarcode) {
        stopBarcodeScanning();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        activeItem={activeMenuItem}
        onItemClick={(item) => setActiveMenuItem(item.id)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isCartModalOpen={isCartModalOpen}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNavBar onCartModalStateChange={setIsCartModalOpen} />
        
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Plus className="h-8 w-8 text-green-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">New Stock</h1>
                <p className="text-sm text-gray-500">Add new inventory items with barcode</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {/* Success/Error Messages */}
            {success && (
              <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
                <CheckCircle className="h-5 w-5 text-green-600 mr-3" />
                <span className="text-green-800">{success}</span>
              </div>
            )}
            
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
                <AlertCircle className="h-5 w-5 text-red-600 mr-3" />
                <span className="text-red-800">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Basic Information */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Product Name *
                    </label>
                    <input
                       type="text"
                       value={formData.name}
                       onChange={(e) => handleInputChange('name', e.target.value)}
                       className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500 ${
                         formErrors.name ? 'border-red-500' : 'border-gray-300'
                       }`}
                       placeholder="Enter product name"
                     />
                    {formErrors.name && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category *
                    </label>
                    <select
                       title="category"
                       value={formData.category}
                       onChange={(e) => handleInputChange('category', e.target.value)}
                       className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 ${
                         formErrors.category ? 'border-red-500' : 'border-gray-300'
                       }`}
                     >
                      <option value="">Select category</option>
                      {categories.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    {formErrors.category && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.category}</p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                       value={formData.description}
                       onChange={(e) => handleInputChange('description', e.target.value)}
                       rows={3}
                       className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                       placeholder="Enter product description"
                     />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Supplier
                    </label>
                    <input
                       type="text"
                       value={formData.supplier}
                       onChange={(e) => handleInputChange('supplier', e.target.value)}
                       className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                       placeholder="Enter supplier name"
                     />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Image URL
                    </label>
                    <input
                       type="url"
                       value={formData.imageUrl}
                       onChange={(e) => handleInputChange('imageUrl', e.target.value)}
                       className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                       placeholder="Enter image URL"
                     />
                  </div>
                </div>
              </div>

              {/* Barcode Section */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Barcode</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Barcode *
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={formData.barcode}
                        onChange={(e) => handleInputChange('barcode', e.target.value)}
                        className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500 ${
                          formErrors.barcode ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder="Enter or generate barcode"
                      />
                      <Button
                        type="button"
                        onClick={generateBarcode}
                        disabled={isGeneratingBarcode}
                        variant="outline"
                        className="whitespace-nowrap"
                      >
                        {isGeneratingBarcode ? (
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <QrCode className="h-4 w-4 mr-2" />
                        )}
                        Generate
                      </Button>
                      <Button
                        type="button"
                        onClick={isScanningBarcode ? stopBarcodeScanning : startBarcodeScanning}
                        variant="outline"
                        className="whitespace-nowrap"
                      >
                        {isScanningBarcode ? (
                          <X className="h-4 w-4 mr-2" />
                        ) : (
                          <Scan className="h-4 w-4 mr-2" />
                        )}
                        {isScanningBarcode ? 'Stop' : 'Scan'}
                      </Button>
                    </div>
                    {formErrors.barcode && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.barcode}</p>
                    )}
                  </div>

                  {/* Camera View for Barcode Scanning */}
                  {isScanningBarcode && (
                    <div className="border border-gray-300 rounded-lg p-4">
                      <div className="text-center">
                        <video
                          ref={videoRef}
                          className="w-full max-w-md mx-auto rounded-lg"
                          autoPlay
                          playsInline
                        />
                        <canvas ref={canvasRef} className="hidden" />
                        <p className="mt-2 text-sm text-gray-600">
                          Position the barcode within the camera view
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Pricing and Inventory */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing & Inventory</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cost Price *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.costPrice}
                      onChange={(e) => handleInputChange('costPrice', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500 ${
                        formErrors.costPrice ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="0.00"
                    />
                    {formErrors.costPrice && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.costPrice}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Selling Price *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.sellingPrice}
                      onChange={(e) => handleInputChange('sellingPrice', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500 ${
                        formErrors.sellingPrice ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="0.00"
                    />
                    {formErrors.sellingPrice && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.sellingPrice}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Initial Quantity *
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.quantity}
                      onChange={(e) => handleInputChange('quantity', parseInt(e.target.value) || 0)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        formErrors.quantity ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="0"
                    />
                    {formErrors.quantity && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.quantity}</p>
                    )}
                  </div>
                </div>

                {/* Profit Margin Display */}
                {formData.costPrice > 0 && formData.sellingPrice > 0 && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600">
                      Profit Margin: <span className="font-semibold text-gray-900">
                        {formatPrice(formData.sellingPrice - formData.costPrice)} 
                        ({(((formData.sellingPrice - formData.costPrice) / formData.costPrice) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Colors and Sizes */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Colors & Sizes</h2>
                
                {/* Colors */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Available Colors
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {formData.colors.map((color) => (
                      <span
                        key={color}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                      >
                        {color}
                        <button
                          title="button"
                          type="button"
                          onClick={() => removeColor(color)}
                          className="ml-2 text-blue-600 hover:text-blue-800"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addColor())}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                      placeholder="Enter color"
                    />
                    <Button type="button" onClick={addColor} variant="outline">
                      Add
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {commonColors.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => {
                          if (!formData.colors.includes(color)) {
                            setFormData(prev => ({ ...prev, colors: [...prev.colors, color] }));
                          }
                        }}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sizes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Available Sizes
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {formData.sizes.map((size) => (
                      <span
                        key={size}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800"
                      >
                        {size}
                        <button
                          title="button"
                          type="button"
                          onClick={() => removeSize(size)}
                          className="ml-2 text-green-600 hover:text-green-800"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newSize}
                      onChange={(e) => setNewSize(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSize())}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                      placeholder="Enter size"
                    />
                    <Button type="button" onClick={addSize} variant="outline">
                      Add
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {commonSizes.map(size => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => {
                          if (!formData.sizes.includes(size)) {
                            setFormData(prev => ({ ...prev, sizes: [...prev.sizes, size] }));
                          }
                        }}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFormData({
                      name: '',
                      category: '',
                      barcode: '',
                      costPrice: 0,
                      sellingPrice: 0,
                      quantity: 0,
                      colors: [],
                      sizes: [],
                      description: '',
                      supplier: '',
                      imageUrl: ''
                    });
                    setFormErrors({});
                    setError(null);
                  }}
                >
                  Reset Form
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Add Stock Item
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewStockPage() {
  return (
    <ProtectedRoute requiredRole="owner">
      <NewStockContent />
    </ProtectedRoute>
  );
}