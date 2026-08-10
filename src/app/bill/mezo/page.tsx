"use client";

import React, { useState } from "react";
import Image from "next/image";

export default function MezoBillPage() {
  const [isEditing, setIsEditing] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("ARI/2026-08/0144");
  const [invoiceDate, setInvoiceDate] = useState("August 5, 2026");

  // Billed By Details
  const [sellerName, setSellerName] = useState("Aries AI");
  const [sellerAddress, setSellerAddress] = useState(
    "Office Address: 3-CHHA, SECTOR-3 JAWAHAR NAGAR, JAIPUR"
  );

  // Billed To Details
  const [buyerName, setBuyerName] = useState("Mezo Jaipur");
  const [buyerAddress, setBuyerAddress] = useState(
    "Ground floor, plot no. 5&6, Airport Plaza, Radisson Blu hotel near, Mata colony, Tonk Road, Jaipur, Rajasthan"
  );

  // Invoice Item
  const [itemTitle, setItemTitle] = useState("Aries AI Platform Subscription");
  const [itemSubtitle, setItemSubtitle] = useState(
    "AI Automation & WhatsApp Services (August 2026)"
  );
  const [rate, setRate] = useState(6000);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-6 print:py-0 print:px-0 print:bg-white font-sans antialiased">
      {/* Top Action Bar (Hides on Print) */}
      <div className="max-w-2xl mx-auto mb-6 flex items-center justify-between bg-white p-3.5 rounded-xl shadow-sm border border-slate-200 print:hidden">
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 relative">
            <Image
              src="/favicon.png"
              alt="Aries AI Logo"
              width={24}
              height={24}
              className="object-contain"
            />
          </div>
          <span className="font-semibold text-sm text-slate-900">
            Aries AI — Payment Receipt (Mezo Jaipur)
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-slate-700"
          >
            {isEditing ? "Done Editing" : "Edit Fields"}
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Main Plain White Receipt Container */}
      <div className="max-w-2xl mx-auto bg-white border border-slate-200 shadow-sm print:shadow-none print:border-none p-8 sm:p-12 rounded-xl text-sm">
        
        {/* Brand & Receipt Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="flex items-center space-x-2.5">
              <img
                src="/favicon.png"
                alt="Aries AI Logo"
                className="w-9 h-9 object-contain"
              />
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {isEditing ? (
                  <input
                    type="text"
                    value={sellerName}
                    onChange={(e) => setSellerName(e.target.value)}
                    className="border border-slate-300 px-1 py-0.5 rounded"
                  />
                ) : (
                  sellerName
                )}
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {isEditing ? (
                <input
                  type="text"
                  value={sellerAddress}
                  onChange={(e) => setSellerAddress(e.target.value)}
                  className="border border-slate-300 px-1 py-0.5 w-full"
                />
              ) : (
                sellerAddress
              )}
            </p>
          </div>

          <div className="text-right">
            <span className="inline-block bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold px-2.5 py-0.5 rounded uppercase tracking-wider mb-1.5">
              Payment Received
            </span>
            <p className="text-xs text-slate-500">
              Receipt #:{" "}
              {isEditing ? (
                <input
                  type="text"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className="border border-slate-300 px-1 py-0.5 text-right w-36"
                />
              ) : (
                <strong className="text-slate-900">{invoiceNo}</strong>
              )}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Date:{" "}
              {isEditing ? (
                <input
                  type="text"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="border border-slate-300 px-1 py-0.5 text-right w-28"
                />
              ) : (
                <strong className="text-slate-900">{invoiceDate}</strong>
              )}
            </p>
          </div>
        </div>

        <div className="h-px bg-slate-100 my-7"></div>

        {/* Billed To */}
        <div className="mb-8">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
            Billed To (Client)
          </span>
          <p className="font-bold text-slate-900 text-base mb-1">
            {isEditing ? (
              <input
                type="text"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                className="w-full border border-slate-300 p-1 font-bold"
              />
            ) : (
              buyerName
            )}
          </p>
          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
            {isEditing ? (
              <textarea
                rows={2}
                value={buyerAddress}
                onChange={(e) => setBuyerAddress(e.target.value)}
                className="w-full border border-slate-300 p-1 text-xs"
              />
            ) : (
              buyerAddress
            )}
          </p>
        </div>

        {/* Item Table */}
        <div className="mb-7">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="pb-2.5 w-3/4">Description</th>
                <th className="pb-2.5 text-center w-1/8">Billing</th>
                <th className="pb-2.5 text-right w-1/8">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="py-4">
                  <div className="font-bold text-slate-900 text-sm">
                    {isEditing ? (
                      <input
                        type="text"
                        value={itemTitle}
                        onChange={(e) => setItemTitle(e.target.value)}
                        className="w-full border border-slate-300 p-1"
                      />
                    ) : (
                      itemTitle
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {isEditing ? (
                      <input
                        type="text"
                        value={itemSubtitle}
                        onChange={(e) => setItemSubtitle(e.target.value)}
                        className="w-full border border-slate-300 p-1"
                      />
                    ) : (
                      itemSubtitle
                    )}
                  </div>
                </td>
                <td className="py-4 text-center text-slate-500 font-medium">
                  Monthly
                </td>
                <td className="py-4 text-right font-mono font-bold text-slate-900 text-sm">
                  {isEditing ? (
                    <input
                      type="number"
                      value={rate}
                      onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
                      className="w-24 border border-slate-300 p-1 text-right"
                    />
                  ) : (
                    `₹${rate.toLocaleString("en-IN")}.00`
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Total Summary */}
        <div className="flex justify-between items-start pt-2">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
              Amount in Words
            </span>
            <p className="text-xs italic text-slate-500">
              Six Thousand Indian Rupees Only
            </p>
          </div>

          <div className="text-right">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
              Total Paid
            </span>
            <span className="text-2xl font-extrabold text-emerald-700 font-mono tracking-tight">
              ₹{rate.toLocaleString("en-IN")}.00
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
