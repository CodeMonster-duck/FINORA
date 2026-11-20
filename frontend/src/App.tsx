import { lazy, Suspense, useState } from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthScreen } from './components/AuthScreen';
import { BudgetFormModal } from './components/BudgetFormModal';
import { CopilotDrawer } from './components/CopilotDrawer';
import { HelpSupportModal } from './components/HelpSupportModal';
import { SavingsGoalModal } from './components/SavingsGoalModal';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { TransactionFormModal } from './components/TransactionFormModal';
import { VoiceAssistantModal } from './components/VoiceAssistantModal';
import { FinanceProvider } from './context/FinanceContext';
import { useFinance } from './context/financeStore';

const Dashboard = lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const Transactions = lazy(() =>
  import('./pages/Transactions').then((m) => ({ default: m.Transactions })),
);
const Budgets = lazy(() =>
  import('./pages/Budgets').then((m) => ({ default: m.Budgets })),
);
const Savings = lazy(() =>
  import('./pages/Savings').then((m) => ({ default: m.Savings })),
);
const Analytics = lazy(() =>
  import('./pages/Analytics').then((m) => ({ default: m.Analytics })),
);
const Reports = lazy(() =>
  import('./pages/Reports').then((m) => ({ default: m.Reports })),
);
const Settings = lazy(() =>
  import('./pages/Settings').then((m) => ({ default: m.Settings })),
);

function RouteLoadingFallback() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="skeleton-box" style={{ height: '64px' }} />
      <div className="grid-4">
        <div className="skeleton-box" style={{ height: '130px' }} />
        <div className="skeleton-box" style={{ height: '130px' }} />
        <div className="skeleton-box" style={{ height: '130px' }} />
        <div className="skeleton-box" style={{ height: '130px' }} />
      </div>
      <div className="skeleton-box" style={{ height: '280px' }} />
    </div>
  );
}

function FinoraAppShell() {
  const {
    isAuthenticated,
    budgets,
    error,
    quickModal,
    setQuickModal,
    addTransaction,
    editTransaction,
    addBudget,
    editBudget,
    addSavingsGoal,
    editSavingsGoal,
    reloadData,
  } = useFinance();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="main-column">
        <Topbar
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenCopilot={() => setCopilotOpen(true)}
          onOpenVoice={() => setVoiceModalOpen(true)}
        />

        <main className="page-content">
          {error && (
            <div
              className="card"
              role="alert"
              style={{
                borderColor: 'rgba(248, 113, 113, 0.4)',
                background: 'var(--danger-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle size={18} style={{ color: 'var(--danger)' }} />
                <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{error}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void reloadData()}
              >
                Retry
              </button>
            </div>
          )}

          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/savings" element={<Savings />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <TransactionFormModal
        isOpen={quickModal.kind === 'transaction'}
        onClose={() => setQuickModal({ kind: 'none' })}
        defaultType={
          quickModal.kind === 'transaction' ? quickModal.defaultType : 'expense'
        }
        editingTransaction={
          quickModal.kind === 'transaction' ? quickModal.editing : undefined
        }
        onSubmit={(input) =>
          quickModal.kind === 'transaction' && quickModal.editing
            ? editTransaction(quickModal.editing.id, input)
            : addTransaction(input)
        }
      />

      <BudgetFormModal
        isOpen={quickModal.kind === 'budget'}
        onClose={() => setQuickModal({ kind: 'none' })}
        existingBudgets={budgets}
        editingBudget={
          quickModal.kind === 'budget' ? quickModal.editing : undefined
        }
        onSubmit={(input) =>
          quickModal.kind === 'budget' && quickModal.editing
            ? editBudget(quickModal.editing.id, input)
            : addBudget(input)
        }
      />

      <SavingsGoalModal
        isOpen={quickModal.kind === 'savings-goal'}
        onClose={() => setQuickModal({ kind: 'none' })}
        editingGoal={
          quickModal.kind === 'savings-goal' ? quickModal.editing : undefined
        }
        onSubmit={(input) =>
          quickModal.kind === 'savings-goal' && quickModal.editing
            ? editSavingsGoal(quickModal.editing.id, input)
            : addSavingsGoal(input)
        }
      />

      <HelpSupportModal
        isOpen={quickModal.kind === 'help'}
        onClose={() => setQuickModal({ kind: 'none' })}
      />

      {/* Floating AI Copilot Trigger */}
      <button
        type="button"
        onClick={() => setCopilotOpen(true)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 8888,
          borderRadius: '50px',
          padding: '12px 18px',
          background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
          color: '#FFFFFF',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          boxShadow: '0 8px 24px rgba(139, 92, 246, 0.45)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 700,
          fontSize: '13px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        title="Open AI Financial Copilot"
      >
        <Sparkles size={16} />
        <span>Ask Copilot</span>
      </button>

      {/* AI Financial Copilot Drawer */}
      <CopilotDrawer
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
      />

      {/* Voice Finance Assistant Modal */}
      <VoiceAssistantModal
        isOpen={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        onConfirmTransaction={addTransaction}
      />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <FinanceProvider>
        <FinoraAppShell />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3200,
            style: {
              background: '#19172F',
              color: '#F8FAFC',
              border: '1px solid rgba(139, 92, 246, 0.32)',
              borderRadius: '12px',
              fontSize: '13.5px',
              boxShadow: '0 18px 40px -12px rgba(0, 0, 0, 0.7)',
            },
            success: {
              iconTheme: {
                primary: '#22C55E',
                secondary: '#19172F',
              },
            },
            error: {
              iconTheme: {
                primary: '#F87171',
                secondary: '#19172F',
              },
            },
          }}
        />
      </FinanceProvider>
    </BrowserRouter>
  );
}

export default App;
