import React from 'react';

const renderStars = (count, size = 14) => {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <span 
        key={i} 
        className={i <= count ? 'text-amber-500' : 'text-gray-200'}
        style={{ fontSize: `${size}px` }}
      >
        ★
      </span>
    );
  }
  return stars;
};

const getInitials = (name, gender) => name.charAt(0);

export function ReviewsSidebar({ reviews }) {
  const { average, total, breakdown, items } = reviews;

  return (
    <aside className="sticky top-20 bg-white rounded-2xl p-6 h-fit">
      <div className="flex justify-between items-center mb-5 pb-3 border-b border-gray-200">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Customer Reviews</h3>
        <span className="text-[13px] text-[#E8540A] cursor-pointer">View all ({total}) →</span>
      </div>

      {/* Summary Score */}
      <div className="text-center mb-6 pb-5 border-b border-gray-200">
        <div className="text-5xl font-bold text-[#1A1A1A] leading-none">{average}</div>
        <div className="flex justify-center gap-0.5 my-2">
          {renderStars(5, 20)}
        </div>
        <div className="text-sm text-gray-500">({total} reviews)</div>
      </div>

      {/* Rating Breakdown */}
      <div className="mb-6 pb-5 border-b border-gray-200">
        {breakdown.map((item) => (
          <div key={item.stars} className="flex items-center gap-2 mb-2">
            <span className="text-[13px] text-gray-700 w-8">{item.stars} ★</span>
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-500 rounded-full" 
                style={{ width: `${item.percent}%` }} 
              />
            </div>
            <span className="text-xs text-gray-500 w-9 text-right">{item.percent}%</span>
          </div>
        ))}
      </div>

      {/* Review List */}
      <div className="flex flex-col">
        {items.map((review, index) => (
          <div key={index} className="py-4 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                review.avatarGender === 'female' ? 'bg-pink-100 text-pink-600' : 'bg-gray-200 text-gray-600'
              }`}>
                {getInitials(review.name, review.avatarGender)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-900">{review.name}</div>
                <div className="text-xs text-gray-400">{review.timeAgo}</div>
              </div>
              <div className="flex gap-0.5">
                {renderStars(review.stars)}
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{review.text}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}