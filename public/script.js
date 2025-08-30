document.addEventListener('DOMContentLoaded', function() {
    const entryDateInput = document.getElementById('entryDate');
    const entryTextInput = document.getElementById('entryText');
    const addEntryBtn = document.getElementById('addEntry');
    const timelineEntries = document.getElementById('timelineEntries');
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    entryDateInput.value = today;
    
    // Focus on text input
    entryTextInput.focus();
    
    // Add entry function
    function addEntry() {
        const date = entryDateInput.value;
        const text = entryTextInput.value.trim();
        
        if (!date || !text) {
            alert('Please fill in both date and text fields.');
            return;
        }
        
        // Create new timeline entry
        const entryDiv = document.createElement('div');
        entryDiv.className = 'timeline-entry';
        
        // Format the date for display
        const dateObj = new Date(date);
        const formattedDate = dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        entryDiv.innerHTML = `
            <div class="entry-content">
                <div class="entry-date">${formattedDate}</div>
                <div class="entry-text">${text}</div>
            </div>
        `;
        
        // Add entry to timeline (entries will alternate left/right automatically via CSS)
        timelineEntries.appendChild(entryDiv);
        
        // Clear inputs
        entryTextInput.value = '';
        entryTextInput.focus();
        
        // Add a subtle animation
        entryDiv.style.opacity = '0';
        entryDiv.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            entryDiv.style.transition = 'all 0.3s ease';
            entryDiv.style.opacity = '1';
            entryDiv.style.transform = 'translateY(0)';
        }, 10);
    }
    
    // Event listeners
    addEntryBtn.addEventListener('click', addEntry);
    
    // Allow adding entries with Enter key
    entryTextInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addEntry();
        }
    });
    
    // Add some sample entries for demonstration
    const sampleEntries = [
        { date: '2024-01-01', text: 'Started the new year with fresh goals and aspirations.' },
        { date: '2024-02-14', text: 'Celebrated Valentine\'s Day with a romantic dinner.' },
        { date: '2024-03-20', text: 'First day of spring - planted flowers in the garden.' }
    ];
    
    // Add sample entries with a delay to show the animation
    sampleEntries.forEach((entry, index) => {
        setTimeout(() => {
            entryDateInput.value = entry.date;
            entryTextInput.value = entry.text;
            addEntry();
        }, (index + 1) * 500);
    });
    
    // Reset to today's date after samples
    setTimeout(() => {
        entryDateInput.value = today;
    }, sampleEntries.length * 500 + 100);
});
