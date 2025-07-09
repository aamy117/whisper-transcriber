// 視訊進度條點擊處理（不使用隱形 range input）

document.addEventListener('DOMContentLoaded', function() {
    const progressContainer = document.getElementById('progressContainer');
    const progressPlayed = document.getElementById('progressPlayed');
    const progressThumb = document.getElementById('progressThumb');
    const videoPlayer = document.getElementById('videoPlayer');
    const progressSlider = document.getElementById('progressSlider');

    // 如果隱藏了 range input，需要手動處理點擊
    if (progressSlider && progressSlider.style.display === 'none') {
        let isDragging = false;

        // 處理進度條點擊
        progressContainer.addEventListener('click', function(e) {
            if (!isDragging && videoPlayer.duration) {
                updateProgress(e);
            }
        });

        // 處理拖動開始
        progressContainer.addEventListener('mousedown', function(e) {
            isDragging = true;
            updateProgress(e);
            
            // 添加全局滑鼠移動監聽
            document.addEventListener('mousemove', handleDrag);
            document.addEventListener('mouseup', handleDragEnd);
        });

        // 處理拖動
        function handleDrag(e) {
            if (isDragging) {
                updateProgress(e);
            }
        }

        // 處理拖動結束
        function handleDragEnd() {
            isDragging = false;
            document.removeEventListener('mousemove', handleDrag);
            document.removeEventListener('mouseup', handleDragEnd);
        }

        // 更新進度
        function updateProgress(e) {
            const rect = progressContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
            
            // 更新視訊時間
            const newTime = (percentage / 100) * videoPlayer.duration;
            videoPlayer.currentTime = newTime;
            
            // 更新進度條視覺
            progressPlayed.style.width = percentage + '%';
            progressThumb.style.left = percentage + '%';
        }

        // 觸控設備支援
        progressContainer.addEventListener('touchstart', function(e) {
            isDragging = true;
            const touch = e.touches[0];
            updateProgressTouch(touch);
            
            document.addEventListener('touchmove', handleTouchDrag, { passive: false });
            document.addEventListener('touchend', handleTouchEnd);
        });

        function handleTouchDrag(e) {
            e.preventDefault();
            if (isDragging) {
                const touch = e.touches[0];
                updateProgressTouch(touch);
            }
        }

        function handleTouchEnd() {
            isDragging = false;
            document.removeEventListener('touchmove', handleTouchDrag);
            document.removeEventListener('touchend', handleTouchEnd);
        }

        function updateProgressTouch(touch) {
            const rect = progressContainer.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
            
            const newTime = (percentage / 100) * videoPlayer.duration;
            videoPlayer.currentTime = newTime;
            
            progressPlayed.style.width = percentage + '%';
            progressThumb.style.left = percentage + '%';
        }
    }
});