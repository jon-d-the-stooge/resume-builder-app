import React from 'react';

/**
 * Root App component for web version.
 * This replaces the Electron-based multi-page navigation with a React SPA.
 *
 * During migration, individual pages can be converted to React components
 * and integrated here with React Router.
 */
function App() {
  return (
    <div className="app">
      {/* Navigation Header */}
      <nav className="nav-header">
        <div className="nav-container">
          <a href="/" className="nav-brand">
            <div className="nav-brand-icon">R</div>
            Resume Optimizer
          </a>
          <div className="nav-links">
            <a href="/" className="nav-link active">Dashboard</a>
            <a href="/optimizer" className="nav-link">Optimizer</a>
            <a href="/queue" className="nav-link">Queue</a>
            <a href="/chat" className="nav-link">Chat</a>
            <a href="/job-search" className="nav-link">Job Search</a>
            <a href="/vault" className="nav-link">Vault</a>
            <a href="/knowledge-base" className="nav-link">Knowledge Base</a>
          </div>
          <a href="/settings" className="nav-settings" title="Settings">⚙</a>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        <header className="dashboard-header">
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">Your resume optimization command center</p>
        </header>

        <div className="dashboard-grid">
          {/* Profile Status Card */}
          <div className="dashboard-card">
            <div className="card-header">
              <div className="card-title-row">
                <div className="card-icon profile">👤</div>
                <h2 className="card-title">Profile Status</h2>
              </div>
              <span className="card-badge badge-success">Web Mode</span>
            </div>
            <div className="card-body">
              <p className="card-description">
                Web version is running. Backend API available at{' '}
                <code>http://localhost:3001</code>
              </p>
            </div>
          </div>

          {/* Quick Optimize Card */}
          <div className="dashboard-card">
            <div className="card-header">
              <div className="card-title-row">
                <div className="card-icon optimize">⚡</div>
                <h2 className="card-title">Quick Optimize</h2>
              </div>
            </div>
            <div className="card-body">
              <p className="card-description">
                Optimize your resume for a specific job posting.
              </p>
              <div className="card-input-group">
                <input
                  type="text"
                  className="card-input"
                  placeholder="Paste job URL or title..."
                />
              </div>
            </div>
            <div className="card-footer">
              <button className="btn btn-primary btn-full">
                Optimize Resume
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
