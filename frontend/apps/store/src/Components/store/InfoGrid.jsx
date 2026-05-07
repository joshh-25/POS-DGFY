import React from 'react';

const PLACEHOLDER_PHOTOS = [
  'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=200&h=200&fit=crop',
  'https://images.unsplash.com/photo-1569093142344-7bdc9b60a36c?w=200&h=200&fit=crop',
  'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=200&h=200&fit=crop',
  'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=200&h=200&fit=crop',
];

const WHY_CHOOSE_US = [
  { icon: '🌶️', text: 'Freshly grilled daily' },
  { icon: '🥣', text: 'Homemade special marinade' },
  { icon: '❤️', text: 'Affordable & sulit servings' },
  { icon: '✨', text: 'Clean & friendly service' },
];

const DELIVERY_LOGOS = [
  { name: 'Grab', color: '#00B05F', text: 'Grab' },
  { name: 'Foodpanda', color: '#E54D2E', text: 'Foodpanda' },
  { name: 'Lalamove', color: '#F5A623', text: 'Lalamove' },
];

export function InfoGrid({ store }) {
  return (
    <div className="grid grid-cols-3 gap-6 p-6 bg-white rounded-2xl mb-6">
      {/* Column 1: Overview */}
      <div className="flex flex-col">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4 pb-2 border-b border-gray-200">Overview</h3>
        <p className="text-sm text-gray-700 leading-relaxed mb-4">{store.overview}</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {PLACEHOLDER_PHOTOS.map((photo, index) => (
            <img 
              key={index} 
              src={photo} 
              alt={`Store photo ${index + 1}`} 
              className="w-full aspect-square object-cover rounded-lg"
            />
          ))}
        </div>
        <a className="text-[13px] text-[#E8540A] hover:underline cursor-pointer flex items-center gap-1">
          View all photos ({store.photoCount}) →
        </a>
      </div>

      {/* Column 2: Contact & Location */}
      <div className="flex flex-col">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4 pb-2 border-b border-gray-200">Contact & Location</h3>
        
        <div className="flex items-center gap-3 py-2.5 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-base">📞</div>
          <span className="text-sm text-gray-700">{store.phone}</span>
        </div>
        
        <div className="flex items-center gap-3 py-2.5 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-base">💬</div>
          <span className="text-sm text-[#E8540A]">Message us</span>
        </div>
        
        <div className="flex items-center gap-3 py-2.5 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center text-base">🕐</div>
          <span className="text-sm text-gray-700">{store.hours}</span>
          <span className="text-[11px] px-2 py-0.5 bg-green-100 text-green-600 rounded font-medium">{store.hoursSchedule}</span>
        </div>
        
        <div className="flex items-center gap-3 py-2.5 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-base">📍</div>
          <span className="text-sm text-gray-700">{store.address}</span>
        </div>
        
        <a className="text-[13px] text-[#E8540A] hover:underline mt-2 block">Get directions →</a>
        
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-xs text-gray-500 mb-2">We deliver via</div>
          <div className="flex gap-4">
            {DELIVERY_LOGOS.map((logo, index) => (
              <span 
                key={index}
                className="text-xs font-semibold px-3 py-1 rounded"
                style={{ background: logo.color, color: 'white' }}
              >
                {logo.text}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Column 3: Why Choose Us */}
      <div className="flex flex-col">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4 pb-2 border-b border-gray-200">Why Choose Us?</h3>
        {WHY_CHOOSE_US.map((item, index) => (
          <div key={index} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
            <div className="w-9 h-9 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center text-base">
              {item.icon}
            </div>
            <span className="text-sm text-gray-700">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}