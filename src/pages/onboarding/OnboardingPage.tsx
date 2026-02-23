import { useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { load } from '@tauri-apps/plugin-store';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import WelcomeStep from './steps/WelcomeStep';
import PermissionStep from './steps/PermissionStep';
import ApiKeyStep from './steps/ApiKeyStep';
import HotkeyStep from './steps/HotkeyStep';
import CompleteStep from './steps/CompleteStep';

const steps = [
  { component: WelcomeStep, label: '欢迎' },
  { component: PermissionStep, label: '权限' },
  { component: ApiKeyStep, label: 'API Key' },
  { component: HotkeyStep, label: '快捷键' },
  { component: CompleteStep, label: '完成' },
];

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0);

  const handleFinish = async () => {
    try {
      const store = await load('config.json', { autoSave: false, defaults: {} });
      await store.set('onboardingCompleted', true);
      await store.save();
      await getCurrentWindow().close();
    } catch (err) {
      console.error('Failed to finish onboarding:', err);
    }
  };

  const StepComponent = steps[currentStep].component;

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 pt-6 pb-2">
        {steps.map((step, index) => (
          <div key={step.label} className="flex items-center">
            <div
              className={`w-2 h-2 rounded-full transition-colors ${
                index <= currentStep ? 'bg-blue-500' : 'bg-gray-200'
              }`}
            />
            {index < steps.length - 1 && (
              <div
                className={`w-8 h-0.5 mx-1 transition-colors ${
                  index < currentStep ? 'bg-blue-500' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        <StepComponent />
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between px-8 py-6 border-t border-gray-100">
        <button
          onClick={() => setCurrentStep(s => s - 1)}
          disabled={currentStep === 0}
          className="flex items-center gap-1 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          上一步
        </button>

        <span className="text-xs text-gray-400">
          {currentStep + 1} / {steps.length}
        </span>

        {currentStep === steps.length - 1 ? (
          <button
            onClick={handleFinish}
            className="flex items-center gap-1 px-6 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            开始使用
          </button>
        ) : (
          <button
            onClick={() => setCurrentStep(s => s + 1)}
            className="flex items-center gap-1 px-4 py-2 text-sm text-blue-500 hover:text-blue-600 transition-colors"
          >
            下一步
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
