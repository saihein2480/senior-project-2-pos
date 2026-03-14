"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, DollarSign, Package } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { WholesaleTier } from "@/types/stock";
import { useCurrency } from "@/contexts/CurrencyContext";

interface WholesalePricingTiersProps {
  wholesaleTiers: WholesaleTier[];
  className?: string;
  title?: string;
  defaultExpanded?: boolean;
}

export function WholesalePricingTiers({
  wholesaleTiers,
  className = "",
  title = "Wholesale Pricing Tiers",
  defaultExpanded = false,
}: WholesalePricingTiersProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { formatPrice } = useCurrency();

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Sort tiers by minimum quantity for better display
  const sortedTiers = [...wholesaleTiers].sort((a, b) => a.minQuantity - b.minQuantity);

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header with toggle button */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <DollarSign className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
            {wholesaleTiers.length > 0 && (
              <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {wholesaleTiers.length} tier{wholesaleTiers.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleExpanded}
            className="flex items-center"
          >
            {isExpanded ? (
              <>
                Hide <ChevronUp className="h-4 w-4 ml-1" />
              </>
            ) : (
              <>
                Show <ChevronDown className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Content area */}
      {isExpanded && (
        <div className="p-6">
          {sortedTiers.length === 0 ? (
            <div className="text-center py-8">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-4 text-gray-500">No wholesale pricing tiers</p>
              <p className="text-sm text-gray-400">
                This product doesn&apos;t have any wholesale pricing configured.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedTiers.map((tier, index) => (
                <div
                  key={tier.id || `tier-${index}-${tier.minQuantity}-${tier.price}`}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center">
                        <span className="text-lg font-medium text-gray-900">
                          {index + 1}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        Minimum Quantity: {tier.minQuantity}
                      </div>
                      {/* <div className="text-sm text-gray-500">
                        {tier.minQuantity === 1 
                          ? "Single item purchase"
                          : `Bulk order of ${tier.minQuantity}+ items`
                        }
                      </div> */}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-green-600">
                      {formatPrice(tier.price)}
                    </div>
                    <div className="text-sm text-gray-500">per item</div>
                  </div>
                </div>
              ))}
              
              {/* Summary information */}
              {sortedTiers.length > 1 && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <DollarSign className="h-5 w-5 text-blue-400 mt-0.5" />
                    </div>
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-blue-900">
                        Pricing Summary
                      </h4>
                      <div className="mt-2 text-sm text-blue-700">
                        <p>
                          Best price: <span className="font-semibold">{formatPrice(Math.min(...sortedTiers.map(t => t.price)))}</span> 
                          {" "}(min. {sortedTiers.find(t => t.price === Math.min(...sortedTiers.map(tier => tier.price)))?.minQuantity} items)
                        </p>
                        <p>
                          Regular price: <span className="font-semibold">{formatPrice(Math.max(...sortedTiers.map(t => t.price)))}</span>
                          {" "}(min. {sortedTiers.find(t => t.price === Math.max(...sortedTiers.map(tier => tier.price)))?.minQuantity} items)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}