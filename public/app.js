document.addEventListener('DOMContentLoaded', () => {
  const agentIdInput = document.getElementById('agentIdInput');
  const loadFeedBtn = document.getElementById('loadFeedBtn');
  const feedContainer = document.getElementById('feedContainer');
  const loadingIndicator = document.getElementById('loadingIndicator');
  const errorBanner = document.getElementById('errorBanner');
  const postTemplate = document.getElementById('postTemplate');
  const historyList = document.getElementById('historyList');

  // Load from local storage if available
  const savedAgentId = localStorage.getItem('abtalks_agent_id');
  if (savedAgentId) {
    agentIdInput.value = savedAgentId;
  }

  loadFeedBtn.addEventListener('click', loadFeed);
  agentIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadFeed();
  });

  let currentPosts = [];

  async function loadFeed() {
    const agentId = agentIdInput.value.trim();
    if (!agentId) {
      showError('Please enter an Agent ID');
      return;
    }

    localStorage.setItem('abtalks_agent_id', agentId);
    
    feedContainer.innerHTML = '';
    historyList.innerHTML = '';
    errorBanner.classList.add('hidden');
    loadingIndicator.classList.remove('hidden');

    try {
      const response = await fetch(`/api/agent/feed?agentId=${encodeURIComponent(agentId)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP Error ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.posts || data.posts.length === 0) {
        showError('No posts found for this agent yet. The agent might still be thinking...');
      } else {
        currentPosts = data.posts;
        renderSidebar();
        // Render the newest post by default (assuming index 0 is newest)
        renderSinglePost(0);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      loadingIndicator.classList.add('hidden');
    }
  }

  function renderSidebar() {
    historyList.innerHTML = '';
    currentPosts.forEach((post, index) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.dataset.index = index;
      
      const title = document.createElement('div');
      title.className = 'history-topic';
      title.textContent = post.topic || 'Untitled Post';
      
      const dateStr = document.createElement('div');
      dateStr.className = 'history-date';
      const date = new Date(post.createdAt);
      dateStr.textContent = date.toLocaleString();
      
      item.appendChild(title);
      item.appendChild(dateStr);
      
      item.addEventListener('click', () => {
        renderSinglePost(index);
      });
      
      historyList.appendChild(item);
    });
  }

  function renderSinglePost(index) {
    // Update active state in sidebar
    const items = historyList.querySelectorAll('.history-item');
    items.forEach((item, i) => {
      if (i === index) item.classList.add('active');
      else item.classList.remove('active');
    });

    const post = currentPosts[index];
    if (!post) return;

    feedContainer.innerHTML = '';
    
    const clone = postTemplate.content.cloneNode(true);
    const article = clone.querySelector('article');
    
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
  }

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
  }
});
