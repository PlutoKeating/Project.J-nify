import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LangProvider } from '../src/i18n';
import NudgeCard from '../src/components/NudgeCard';
import DecisionGrid from '../src/components/DecisionGrid';
import SignalGrid from '../src/components/SignalGrid';
import CompareTable from '../src/components/CompareTable';
import ScenarioCard from '../src/components/ScenarioCard';

const wrap = (ui: ReactNode) => render(<LangProvider>{ui}</LangProvider>);

describe('shared components', () => {
  it('NudgeCard shows four decisions', () => {
    wrap(<NudgeCard />);
    expect(screen.getByText(/现在做/)).toBeInTheDocument();
    expect(screen.getByText(/晚点/)).toBeInTheDocument();
    expect(screen.getByText(/算了/)).toBeInTheDocument();
    expect(screen.getByText(/帮我兜底/)).toBeInTheDocument();
  });

  it('DecisionGrid shows four decisions', () => {
    wrap(<DecisionGrid />);
    expect(screen.getByText(/现在做/)).toBeInTheDocument();
    expect(screen.getByText(/帮我兜底/)).toBeInTheDocument();
  });

  it('SignalGrid renders five signals', () => {
    wrap(<SignalGrid />);
    expect(screen.getByText(/日历空档/)).toBeInTheDocument();
    expect(screen.getByText(/天气/)).toBeInTheDocument();
    expect(screen.getByText(/顺路/)).toBeInTheDocument();
    expect(screen.getByText(/使用状态/)).toBeInTheDocument();
    expect(screen.getByText(/死线距离/)).toBeInTheDocument();
  });

  it('CompareTable renders four rows', () => {
    wrap(<CompareTable />);
    expect(screen.getByText(/到点响铃/)).toBeInTheDocument();
    expect(screen.getByText(/状态窗口/)).toBeInTheDocument();
  });

  it('ScenarioCard renders title and body', () => {
    wrap(<ScenarioCard title="标题" body="正文内容" />);
    expect(screen.getByText('标题')).toBeInTheDocument();
    expect(screen.getByText('正文内容')).toBeInTheDocument();
  });
});
