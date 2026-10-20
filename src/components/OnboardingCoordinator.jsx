import React, { useEffect, useRef, useState } from 'react'
import { Building2, Users, ArrowRight, ArrowLeft, Check, Compass } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Modal from './ui/Modal'
import { WELCOME_COPY, validOnboarding, latestOnboarding, getSetupChoices } from '../lib/onboarding'
import './Onboarding.css'

export const TOUR_STEPS = [
  { title: 'Your workspace, at a glance', tab: 'Dashboard', text: 'Start with Dashboard for a quick overview. The sidebar groups your everyday tools and HR work in one place.' },
  { title: 'People are the starting point', tab: 'Employees', text: 'Open Employees to find your team. If you have employee-create permission, use the existing Add Employee form in the directory.' },
  { title: 'Keep everyday work moving', tab: 'Attendance', text: 'Attendance, Tasks and Leave help you manage the working day. Your role determines which tabs and actions you can use.' },
  { title: 'Review, approve and pay', tab: 'Payroll', text: 'Payroll, Approvals and Reports bring review work together. These tools appear only when your role has the relevant permissions.' },
  { title: 'Make the workspace yours', tab: 'Settings', text: 'Admins can open Settings to update the organisation, roles, shifts and policies. Everyone can use My Portal for their own information.' },
]

const primary = 'h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold font-heading shadow-sm active:scale-[0.98] inline-flex items-center justify-center gap-2'
const secondary = 'h-9 px-4 border border-slate-200 bg-white text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50 inline-flex items-center justify-center gap-2'

function readProgress(uid) {
  try { return JSON.parse(localStorage.getItem(`people:onboarding:${uid}`) || 'null') }
  catch { return null }
}

function SetupChoices({ user, onSetup, onTour, onComplete }) {
  const choices = getSetupChoices(user)
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl font-bold text-slate-900">Where would you like to start?</h2>
        <p className="mt-2 text-sm text-slate-600">Use your existing setup screens. Come back to this guide whenever you need it.</p>
      </div>
      <div className="divide-y divide-slate-200 border-y border-slate-200">
        {[['company', Building2, 'Set up company', user.orgId ? 'Review your organisation details in Settings.' : 'Create a company, or join your team with an organisation code.'], ['employee', Users, 'Set up employee', 'Open Employees, then use Add Employee in the directory.']].map(([id, Icon, title, description]) => (
          <div key={id} className="py-4">
            <button type="button" disabled={!choices[id].enabled} aria-describedby={`onboarding-${id}-hint`} onClick={() => onSetup(id)} className="onboarding-choice w-full flex items-center gap-3 text-left rounded-md p-2 -ml-2 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
              <Icon size={22} className="text-blue-600 shrink-0" aria-hidden="true" />
              <span className="flex-1 font-heading text-sm font-bold">{title}</span>
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            <p id={`onboarding-${id}-hint`} className="mt-1 text-sm text-slate-600">{choices[id].enabled ? description : choices[id].reason}</p>
          </div>
        ))}
      </div>
      <button type="button" onClick={onTour} className={`${secondary} w-full`}><Compass size={16} aria-hidden="true" /> Take the five-step tour</button>
      <button type="button" onClick={onComplete} className="text-sm text-slate-600 underline underline-offset-4">Finish onboarding</button>
    </div>
  )
}

function TourControls({ step, onStep, onChoices, onComplete }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className={secondary} onClick={() => step ? onStep(step - 1) : onChoices()}><ArrowLeft size={15} aria-hidden="true" />Back</button>
        <button type="button" className={primary} onClick={() => step === 4 ? onComplete() : onStep(step + 1)}>{step === 4 ? 'Finish tour' : 'Next'}<ArrowRight size={15} aria-hidden="true" /></button>
      </div>
      <button type="button" onClick={onChoices} className="text-sm text-slate-600 underline underline-offset-4">Back to setup choices</button>
    </div>
  )
}

function Welcome({ progress, onContinue }) {
  return (
    <div className="space-y-6">
      <div className="inline-flex items-center gap-2 text-sm font-medium text-green-700"><Check size={18} aria-hidden="true" />{progress.pendingOrg ? 'Organisation created successfully' : 'You’re ready to get started'}</div>
      <h2 className="font-heading text-2xl font-bold leading-relaxed text-slate-900">{WELCOME_COPY}</h2>
      {progress.pendingOrg ? (
        <div className="space-y-2 text-sm text-slate-600">
          <p><strong className="text-slate-900">{progress.pendingOrg.name}</strong> is ready. Share this organisation code with your team:</p>
          <p className="font-mono select-all break-all rounded-md border border-slate-200 bg-white p-3 text-slate-900">{progress.pendingOrg.code}</p>
        </div>
      ) : <p className="text-sm text-slate-600">A little guidance for your first day. Set up your company, add your people, or get to know the app.</p>}
      <button type="button" className={primary} onClick={onContinue}>Let’s get started<ArrowRight size={16} aria-hidden="true" /></button>
    </div>
  )
}

export function WebOnboarding({ progress, user, actions }) {
  const step = TOUR_STEPS[progress.step]
  if (progress.view !== 'tour') return <div className="p-8 lg:p-10">{progress.view === 'welcome' ? <Welcome progress={progress} onContinue={actions.choices} /> : <SetupChoices user={user} onSetup={actions.setup} onTour={actions.tour} onComplete={actions.complete} />}</div>
  return (
    <div className="grid grid-cols-[210px_1fr] min-h-[380px]">
      <aside className="bg-white border-r border-slate-200 p-6" aria-label="Illustrated app navigation">
        <p className="font-heading font-bold text-slate-900 mb-6">People app</p>
        {TOUR_STEPS.map((item, index) => <div key={item.tab} className={`onboarding-demo-tab text-sm px-3 py-3 rounded-md mb-1 ${index === progress.step ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-500'}`} aria-current={index === progress.step ? 'step' : undefined}>{item.tab}</div>)}
        <p className="text-xs text-slate-500 mt-6">Illustration · actual tabs depend on your role</p>
      </aside>
      <div className="p-8 flex flex-col justify-between gap-8">
        <div key={progress.step} className="onboarding-scene" aria-live="polite" aria-atomic="true">
          <p className="font-mono text-xs text-blue-700 mb-4">STEP {progress.step + 1} OF 5</p>
          <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">{step.title}</h2>
          <p className="text-sm leading-relaxed text-slate-600">{step.text}</p>
        </div>
        <TourControls step={progress.step} onStep={actions.step} onChoices={actions.choices} onComplete={actions.complete} />
      </div>
    </div>
  )
}

export function MobileOnboarding({ progress, user, actions }) {
  const step = TOUR_STEPS[progress.step]
  return (
    <div className="p-5 pb-6">
      {progress.view === 'welcome' ? <Welcome progress={progress} onContinue={actions.choices} /> : progress.view !== 'tour' ? <SetupChoices user={user} onSetup={actions.setup} onTour={actions.tour} onComplete={actions.complete} /> : (
        <div className="space-y-6">
          <div className="flex gap-2" aria-label={`Step ${progress.step + 1} of 5`}>{TOUR_STEPS.map((item, index) => <span key={item.tab} className={`h-1 flex-1 rounded-full ${index <= progress.step ? 'bg-blue-600' : 'bg-slate-200'}`} />)}</div>
          <div key={progress.step} className="onboarding-scene space-y-4" aria-live="polite" aria-atomic="true">
            <p className="font-mono text-xs text-blue-700">STEP {progress.step + 1} OF 5 · {step.tab}</p>
            <h2 className="font-heading text-xl font-bold text-slate-900">{step.title}</h2>
            <p className="text-sm leading-relaxed text-slate-600">{step.text}</p>
            <p className="text-sm text-slate-600">On mobile, open the app menu to find the tools available to your role.</p>
          </div>
          <TourControls step={progress.step} onStep={actions.step} onChoices={actions.choices} onComplete={actions.complete} />
        </div>
      )}
    </div>
  )
}

function OnboardingSession({ user, isMobile, saveOnboarding }) {
  const navigate = useNavigate()
  const [localProgress, setLocalProgress] = useState(() => readProgress(user.uid))
  const [syncError, setSyncError] = useState('')
  const queue = useRef(Promise.resolve())
  const recovered = useRef(false)
  const progress = latestOnboarding(user.onboarding, localProgress)

  useEffect(() => {
    if (recovered.current) return
    recovered.current = true
    if (validOnboarding(localProgress) && localProgress.updatedAt > user.onboarding.updatedAt) {
      queue.current = saveOnboarding(localProgress).catch(() => setSyncError('Progress has not synced to your account. Retry before using another device.'))
    }
  }, [localProgress, user.onboarding, saveOnboarding])

  if (!progress) return null

  const update = (patch) => {
    const next = { ...progress, ...patch, updatedAt: Math.max(Date.now(), progress.updatedAt + 1) }
    setLocalProgress(next)
    try { localStorage.setItem(`people:onboarding:${user.uid}`, JSON.stringify(next)) }
    catch { setSyncError('Browser storage is unavailable. Keep this page open until progress syncs.') }
    queue.current = queue.current.catch(() => {}).then(() => saveOnboarding(next)).then(() => setSyncError('')).catch(() => setSyncError('Progress has not synced to your account. Retry before using another device.'))
  }
  const actions = {
    choices: () => update({ status: 'active', view: 'choices', pendingOrg: null }),
    tour: () => update({ status: 'active', view: 'tour' }),
    step: step => update({ step }),
    complete: () => update({ status: 'complete', pendingOrg: null }),
    setup: kind => {
      if (!getSetupChoices(user)[kind]?.enabled) return
      update({ view: 'setup' })
      const tab = user.orgId ? `tab=${kind === 'company' ? 'settings' : 'employees'}&` : ''
      navigate(`${isMobile ? '/mobile' : '/'}?${tab}setup=${kind}`)
    },
  }
  const isOpen = progress.status === 'active' && progress.view !== 'setup'
  const Presentation = isMobile ? MobileOnboarding : WebOnboarding
  return (
    <>
      <Modal isOpen={isOpen} onClose={() => update({ status: 'dismissed' })} title="Getting started" size={isMobile ? 'lg' : '3xl'}>
        <Presentation progress={progress} user={user} actions={actions} />
        <div className="px-5 pb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="text-sm text-slate-600 underline underline-offset-4" onClick={() => update({ status: 'dismissed' })}>Do this later</button>
          {syncError && <p role="status" className="text-xs text-amber-800">{syncError} <button type="button" className="underline" onClick={() => update({})}>Retry sync</button></p>}
        </div>
      </Modal>
      {!isOpen && progress.status !== 'complete' && <div className="onboarding-resume fixed right-4 z-[1001] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
        <button type="button" className="flex items-center gap-2 text-sm font-semibold text-blue-700 min-h-9" onClick={() => update({ status: 'active', view: progress.view === 'setup' ? 'choices' : progress.view })}><Compass size={17} aria-hidden="true" />Resume getting started</button>
        {syncError && <p role="status" className="max-w-xs text-xs text-amber-800">{syncError} <button type="button" className="underline" onClick={() => update({})}>Retry sync</button></p>}
      </div>}
      {!isOpen && progress.status === 'complete' && syncError && <div role="status" className="onboarding-resume fixed right-4 z-[1001] rounded-xl border border-slate-200 bg-white p-3 text-xs text-amber-800 max-w-xs">{syncError} <button type="button" className="underline" onClick={() => update({})}>Retry sync</button></div>}
    </>
  )
}

export default function OnboardingCoordinator({ isMobile }) {
  const { user, loading, saveOnboarding } = useAuth()
  if (loading || !user || !validOnboarding(user.onboarding)) return null
  return <OnboardingSession key={user.uid} user={user} isMobile={isMobile} saveOnboarding={saveOnboarding} />
}
