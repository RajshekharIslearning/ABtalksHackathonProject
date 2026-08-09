document.addEventListener('DOMContentLoaded', () => {
  const agentIdInput = document.getElementById('agentIdInput');
  const loadFeedBtn = document.getElementById('loadFeedBtn');
  const feedContainer = document.getElementById('feedContainer');
  const loadingIndicator = document.getElementById('loadingIndicator');
  const errorBanner = document.getElementById('errorBanner');
  const emptyState = document.getElementById('emptyState');
  const postTemplate = document.getElementById('postTemplate');

  // Load from local storage if available
  const savedAgentId = localStorage.getItem('abtalks_agent_id');
  if (savedAgentId) {
    agentIdInput.value = savedAgentId;
  }

  loadFeedBtn.addEventListener('click', loadFeed);
  agentIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadFeed();
  });

  async function loadFeed() {
    const agentId = agentIdInput.value.trim();
    if (!agentId) {
      showError('Please enter an Agent ID');
      return;
    }

    localStorage.setItem('abtalks_agent_id', agentId);
    
    feedContainer.innerHTML = '';
    errorBanner.classList.add('hidden');
    emptyState.classList.add('hidden');
    feedContainer.classList.add('hidden');
    loadingIndicator.classList.remove('hidden');

    try {
      const response = await fetch(`/api/agent/feed?agentId=${encodeURIComponent(agentId)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP Error ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.posts || data.posts.length === 0) {
        // Show beautiful empty state instead of red error banner
        emptyState.classList.remove('hidden');
      } else {
        feedContainer.classList.remove('hidden');
        renderPosts(data.posts);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      loadingIndicator.classList.add('hidden');
    }
  }

  function renderPosts(posts) {
    posts.forEach((post, index) => {
      const clone = postTemplate.content.cloneNode(true);
      const article = clone.querySelector('article');
      
      // Stagger animation
      article.style.animationDelay = `${index * 0.1}s`;

      // Date formatting
      const date = new Date(post.createdAt);
      clone.querySelector('.post-date').textContent = date.toLocaleString();

      // Text and Topic
      clone.querySelector('.post-text').textContent = post.text;
      clone.querySelector('.topic-tag').textContent = post.topic;

      // Rationale
      const rationale = post.rationale || {};
      clone.querySelector('.why-selected').textContent = rationale.whySelected || 'N/A';
      clone.querySelector('.why-now').textContent = rationale.whyRelevantNow || 'N/A';
      clone.querySelector('.editorial-standards').textContent = rationale.editorialStandards || 'N/A';

      // Sources
      const sourcesList = clone.querySelector('.sources-list');
      const sources = post.sources || [];
      if (sources.length > 0) {
        sources.forEach(src => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = src;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = src;
          li.appendChild(a);
          sourcesList.appendChild(li);
        });
      } else {
        const li = document.createElement('li');
        li.textContent = 'No external sources provided';
        sourcesList.appendChild(li);
      }

      feedContainer.appendChild(clone);
    });
  }

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
  }
});
