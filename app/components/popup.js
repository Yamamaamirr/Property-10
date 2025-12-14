import './popup.css';

export function createPopupHTML(location) {
  return `
    <div class="property-popup">
      <div class="popup-image-container">
        <img src="${location.image}" alt="${location.name}" class="popup-image" />
        <button class="view-full-map">View full Map</button>
      </div>
      <div class="popup-content">
        <h3 class="popup-title">${location.title}</h3>
        <div class="popup-location">
          <svg width="12" height="16" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 0C2.69 0 0 2.69 0 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.31-2.69-6-6-6zm0 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="currentColor"/>
          </svg>
          <span>${location.name}</span>
        </div>
        <div class="popup-details">
          <span class="popup-price">${location.price}</span>
          <span class="popup-size">${location.size}</span>
        </div>
        <div class="popup-tags">
          ${location.tags.map(tag => `<span class="popup-tag">${tag}</span>`).join('')}
        </div>
        <button class="popup-preference">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor"/>
          </svg>
          Add to Preferences
        </button>
      </div>
    </div>
  `;
}
