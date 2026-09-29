'use client'

import {
  Brush,
  Check,
  Eraser,
  Hand,
  Minus,
  MousePointer2,
  Pipette,
  Plus,
  Sparkles,
  Type,
  Square,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ColorWell } from '@/components/controls/ColorWell'
import { usePage } from '@/lib/queries'
import {
  isBrushTool,
  MAX_BRUSH_DIAMETER,
  MIN_BRUSH_DIAMETER,
  useKoharuStore,
  type CanvasTool,
  type EraserMode,
  type RemoveMode,
} from '@/lib/store'
import { Button } from '@koharu/ui/components/button'
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@koharu/ui/components/number-field'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@koharu/ui/components/popover'
import { Slider } from '@koharu/ui/components/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@koharu/ui/components/tooltip'

const tools = [
  ['select', MousePointer2],
  ['text', Type],
  ['draw', Brush],
  ['eraser', Eraser],
  ['color_picker', Pipette],
  ['remove', Sparkles],
  ['pan', Hand],
] as const satisfies ReadonlyArray<readonly [CanvasTool, typeof MousePointer2]>

const eraserModes: ReadonlyArray<readonly [EraserMode, typeof Square]> = [
  ['brush', Brush],
  ['rectangle', Square],
] as const

const removeModes: ReadonlyArray<readonly [RemoveMode, typeof Square]> = [
  ['brush', Sparkles],
  ['rectangle', Square],
] as const

interface ToolBarProps {
  pendingEraseRect?: { x: number; y: number; width: number; height: number; angle_degrees: number; layer: string } | null
  pendingRemoveRect?: { x: number; y: number; width: number; height: number; angle_degrees: number } | null
  onExecuteEraseRect?: () => void
  onExecuteRemoveRect?: () => void
}

export function ToolBar({
  pendingEraseRect,
  pendingRemoveRect,
  onExecuteEraseRect,
  onExecuteRemoveRect,
}: ToolBarProps) {
  const { t } = useTranslation()
  const page = usePage().data
  const active = useKoharuStore((state) => state.tool)
  const brush = useKoharuStore((state) => state.brush)
  const setTool = useKoharuStore((state) => state.setTool)
  const setBrush = useKoharuStore((state) => state.setBrush)
  const shortcuts = useKoharuStore((state) => state.shortcuts)
  const hasBrush = isBrushTool(active)

  // Check if rectangle mode is active for eraser or remove
  const isEraserRectangle = active === 'eraser' && brush.eraserMode === 'rectangle'
  const isRemoveRectangle = active === 'remove' && brush.removeMode === 'rectangle'
  const isRectangleMode = isEraserRectangle || isRemoveRectangle

  // Check if there's a pending rectangle to execute
  const hasPendingExecute = (pendingEraseRect && onExecuteEraseRect) || (pendingRemoveRect && onExecuteRemoveRect)

  return (
    <aside className='absolute top-3 left-3 z-20 flex w-11 flex-col rounded-2xl border border-border bg-[var(--surface-floating)] p-1 shadow-[var(--shadow-toolrail)]'>
      <div className='flex flex-col items-center py-0.5'>
        {tools.map(([tool, Icon], index) => (
          <div key={tool} className='contents'>
            {index === tools.length - 1 && <span className='my-1 h-px w-5 bg-border' />}
            {tool === 'eraser' ? (
              <EraserModePopover
                active={active}
                brush={brush}
                setTool={setTool}
                setBrush={setBrush}
                shortcuts={shortcuts}
                t={t}
                page={page}
              />
            ) : tool === 'remove' ? (
              <RemoveModePopover
                active={active}
                brush={brush}
                setTool={setTool}
                setBrush={setBrush}
                shortcuts={shortcuts}
                t={t}
                page={page}
              />
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      disabled={!page}
                      aria-label={t(`tools.${tool}`)}
                      data-active={active === tool}
                      className='relative text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-30 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground'
                      onClick={() => setTool(tool)}
                    />
                  }
                >
                  <Icon className='size-4' />
                </TooltipTrigger>
                <TooltipContent side='right'>
                  {t(`tools.${tool}`)}
                  <span className='ml-2 opacity-60'>{shortcuts[tool].toUpperCase()}</span>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        ))}
      </div>

      {hasBrush && (
        <div className='flex flex-col items-center gap-1 border-t border-border/80 py-1.5'>
          {active === 'draw' && (
            <ColorWell value={brush.color} onChange={(color) => setBrush({ ...brush, color })} />
          )}
          {!isRectangleMode && (
            <BrushSize
              value={brush.diameter}
              onChange={(diameter) => setBrush({ ...brush, diameter })}
            />
          )}
          {hasPendingExecute && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type='button'
                    size='icon'
                    className='rounded-lg bg-primary/80 hover:bg-primary/90 text-primary-foreground'
                    onClick={() => {
                      if (pendingEraseRect && onExecuteEraseRect) onExecuteEraseRect()
                      else if (pendingRemoveRect && onExecuteRemoveRect) onExecuteRemoveRect()
                    }}
                  >
                    <Check className='size-4 fill-current' />
                  </Button>
                }
              />
              <TooltipContent side='right'>
                {pendingEraseRect ? t('tools.erase') : t('tools.remove')}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </aside>
  )
}

function EraserModePopover({
  active,
  brush,
  setTool,
  setBrush,
  shortcuts,
  t,
  page,
}: {
  active: CanvasTool
  brush: { diameter: number; color: string; eraserMode: EraserMode; removeMode: RemoveMode }
  setTool: (tool: CanvasTool) => void
  setBrush: (brush: { diameter: number; color: string; eraserMode: EraserMode; removeMode: RemoveMode }) => void
  shortcuts: Record<string, string>
  t: (key: string) => string
  page: { id: string } | null | undefined
}) {
  return (
    <Popover>
      <Tooltip>
        <PopoverTrigger
          render={
            <TooltipTrigger
              render={
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  disabled={!page}
                  aria-label={t('tools.eraser')}
                  data-active={active === 'eraser'}
                  className='relative text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-30 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground'
                  onClick={() => setTool('eraser')}
                />
              }
            >
              <Eraser className='size-4' />
            </TooltipTrigger>
          }
        />
        <TooltipContent side='right'>
          {t('tools.eraser')}
          <span className='ml-2 opacity-60'>{shortcuts.eraser.toUpperCase()}</span>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side='right'
        align='center'
        sideOffset={8}
        className='w-40 gap-1 rounded-xl p-2'
      >
        <PopoverTitle className='text-[11px]'>{t('tools.eraserMode')}</PopoverTitle>
        {eraserModes.map(([mode, Icon]) => (
          <Button
            key={mode}
            type='button'
            variant={brush.eraserMode === mode ? 'default' : 'ghost'}
            size='icon'
            className='w-full justify-start gap-2 rounded-lg px-2 py-1.5'
            onClick={() => setBrush({ ...brush, eraserMode: mode })}
          >
            <Icon className='size-4' />
            <span className='text-[11px] font-medium'>{t(`tools.eraserMode.${mode}`)}</span>
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function RemoveModePopover({
  active,
  brush,
  setTool,
  setBrush,
  shortcuts,
  t,
  page,
}: {
  active: CanvasTool
  brush: { diameter: number; color: string; eraserMode: EraserMode; removeMode: RemoveMode }
  setTool: (tool: CanvasTool) => void
  setBrush: (brush: { diameter: number; color: string; eraserMode: EraserMode; removeMode: RemoveMode }) => void
  shortcuts: Record<string, string>
  t: (key: string) => string
  page: { id: string } | null | undefined
}) {
  return (
    <Popover>
      <Tooltip>
        <PopoverTrigger
          render={
            <TooltipTrigger
              render={
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  disabled={!page}
                  aria-label={t('tools.remove')}
                  data-active={active === 'remove'}
                  className='relative text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-30 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground'
                  onClick={() => setTool('remove')}
                />
              }
            >
              <Sparkles className='size-4' />
            </TooltipTrigger>
          }
        />
        <TooltipContent side='right'>
          {t('tools.remove')}
          <span className='ml-2 opacity-60'>{shortcuts.remove.toUpperCase()}</span>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side='right'
        align='center'
        sideOffset={8}
        className='w-40 gap-1 rounded-xl p-2'
      >
        <PopoverTitle className='text-[11px]'>{t('tools.removeMode')}</PopoverTitle>
        {removeModes.map(([mode, Icon]) => (
          <Button
            key={mode}
            type='button'
            variant={brush.removeMode === mode ? 'default' : 'ghost'}
            size='icon'
            className='w-full justify-start gap-2 rounded-lg px-2 py-1.5'
            onClick={() => setBrush({ ...brush, removeMode: mode })}
          >
            <Icon className='size-4' />
            <span className='text-[11px] font-medium'>{t(`tools.removeMode.${mode}`)}</span>
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function BrushSize({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { t } = useTranslation()
  const roundedValue = Math.round(value)

  return (
    <Popover>
      <Tooltip>
        <PopoverTrigger
          render={
            <TooltipTrigger
              render={
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label={t('tools.brushSizePixels', { size: roundedValue })}
                  className='size-8 rounded-xl font-sans text-[11px] leading-none font-medium tracking-[-0.02em] text-muted-foreground tabular-nums hover:bg-foreground/[0.06] hover:text-foreground'
                />
              }
            >
              {roundedValue}
            </TooltipTrigger>
          }
        />
        <TooltipContent side='right'>
          {t('tools.brushSizeShort', { size: roundedValue })}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side='right'
        align='center'
        sideOffset={8}
        className='w-48 gap-2.5 rounded-xl p-2.5'
      >
        <div className='flex items-center justify-between gap-3'>
          <PopoverTitle className='text-[11px]'>{t('tools.brushSize')}</PopoverTitle>
          <NumberField
            min={MIN_BRUSH_DIAMETER}
            max={MAX_BRUSH_DIAMETER}
            step={1}
            value={roundedValue}
            className='w-20'
            onValueChange={(next) => {
              if (next !== null) onChange(clamp(next, MIN_BRUSH_DIAMETER, MAX_BRUSH_DIAMETER))
            }}
          >
            <NumberFieldGroup className='h-7'>
              <NumberFieldDecrement aria-label={t('tools.decreaseBrushSize')}>
                <Minus />
              </NumberFieldDecrement>
              <NumberFieldInput aria-label={t('tools.brushSizeInput')} />
              <NumberFieldIncrement aria-label={t('tools.increaseBrushSize')}>
                <Plus />
              </NumberFieldIncrement>
            </NumberFieldGroup>
          </NumberField>
        </div>
        <Slider
          aria-label={t('tools.brushSize')}
          min={MIN_BRUSH_DIAMETER}
          max={MAX_BRUSH_DIAMETER}
          step={1}
          value={value}
          className='py-1 [&_[data-slot=slider-thumb]]:size-2.5'
          onValueChange={onChange}
        />
      </PopoverContent>
    </Popover>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}
