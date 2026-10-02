'use client'

import { Archive, Folder, FolderPlus, MoreHorizontal, Plus, RotateCcw, Settings, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { call } from '@/lib/backend'
import { pageKey, pagesKey, projectKey, refresh } from '@/lib/queries'
import { useKoharuStore } from '@/lib/store'
import { commands, type ProjectSummary } from '@koharu/bridge/protocol'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@koharu/ui/components/alert-dialog'
import { Button } from '@koharu/ui/components/button'
import { Checkbox } from '@koharu/ui/components/checkbox'
import { Input } from '@koharu/ui/components/input'
import { ScrollArea } from '@koharu/ui/components/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@koharu/ui/components/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@koharu/ui/components/tooltip'

export function StartView() {
  const { t } = useTranslation()
  const setSettingsOpen = useKoharuStore((state) => state.setSettingsOpen)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [archivedProjects, setArchivedProjects] = useState<ProjectSummary[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>('list')
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null)
  const [showArchives, setShowArchives] = useState(false)
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)

  const reload = useCallback(async () => {
    setBusy('list')
    try {
      const [active, archived] = await Promise.all([
        call(commands.listProjects),
        call(commands.listArchivedProjects),
      ])
      setProjects(active)
      setArchivedProjects(archived)
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    void reload().catch(() => undefined)
  }, [reload])

  const createProject = async (event: FormEvent) => {
    event.preventDefault()
    const projectName = name.trim()
    if (!projectName || busy) return
    setBusy('create')
    try {
      await call(commands.createProject, projectName)
      await refresh(projectKey, pagesKey, pageKey)
      setName('')
    } finally {
      setBusy(null)
    }
  }

  const openProject = async (projectName: string) => {
    if (busy || selectionMode) return
    setBusy(projectName)
    try {
      await call(commands.openProject, projectName)
      await refresh(projectKey, pagesKey, pageKey)
    } finally {
      setBusy(null)
    }
  }

  const deleteProject = async () => {
    const projectName = projectToDelete
    if (busy || !projectName) return
    setBusy(projectName)
    try {
      await call(commands.deleteProject, projectName)
      await reload()
      setProjectToDelete(null)
    } finally {
      setBusy(null)
    }
  }

  const archiveProject = async (projectName: string) => {
    if (busy) return
    setBusy(projectName)
    try {
      await call(commands.archiveProject, projectName)
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const restoreProject = async (projectName: string) => {
    if (busy) return
    setBusy(projectName)
    try {
      await call(commands.restoreProject, projectName)
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const bulkArchive = async () => {
    const names = Array.from(selectedProjects)
    if (busy || names.length === 0) return
    setBusy('bulk-archive')
    try {
      await call(commands.archiveProjects, names)
      await reload()
      setSelectedProjects(new Set())
      setSelectionMode(false)
    } finally {
      setBusy(null)
    }
  }

  const bulkRestore = async () => {
    const names = Array.from(selectedProjects)
    if (busy || names.length === 0) return
    setBusy('bulk-restore')
    try {
      await call(commands.restoreProjects, names)
      await reload()
      setSelectedProjects(new Set())
      setSelectionMode(false)
    } finally {
      setBusy(null)
    }
  }

  const bulkDelete = async () => {
    const names = Array.from(selectedProjects)
    if (busy || names.length === 0) return
    setBusy('bulk-delete')
    try {
      for (const name of names) {
        await call(commands.deleteProject, name)
      }
      await reload()
      setSelectedProjects(new Set())
      setSelectionMode(false)
    } finally {
      setBusy(null)
    }
  }

  const toggleProjectSelection = (projectName: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectName)) {
        next.delete(projectName)
      } else {
        next.add(projectName)
      }
      return next
    })
  }

  const toggleSelectAll = (projectList: ProjectSummary[]) => {
    if (selectedProjects.size === projectList.length) {
      setSelectedProjects(new Set())
      setSelectionMode(false)
    } else {
      setSelectedProjects(new Set(projectList.map((p) => p.name)))
      setSelectionMode(true)
    }
  }

  const clearSelection = () => {
    setSelectedProjects(new Set())
    setSelectionMode(false)
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const currentProjects = showArchives ? archivedProjects : projects
  const isArchivedView = showArchives

  return (
    <>
      <AlertDialog
        open={projectToDelete !== null}
        onOpenChange={(open) => {
          if (!open && busy === null) setProjectToDelete(null)
        }}
      >
        <main className='min-h-0 flex-1 overflow-hidden bg-[var(--surface-canvas)]'>
          <ScrollArea className='size-full'>
            <section
              className='mx-auto flex min-h-full w-full max-w-[960px] flex-col px-6 py-10 sm:px-10 sm:py-14'
              aria-labelledby='start-title'
            >
              <header className='flex items-start justify-between gap-6'>
                <div>
                  <h1 id='start-title' className='text-[24px] font-semibold tracking-[-0.03em]'>
                    {t('start.title')}
                  </h1>
                  <p className='mt-1 text-[12px] leading-5 text-muted-foreground'>
                    {t('start.description')}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        className='size-8 shrink-0 text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground'
                        aria-label={t('menu.settings')}
                        onClick={() => setSettingsOpen(true)}
                      />
                    }
                  >
                    <Settings className='size-4' />
                  </TooltipTrigger>
                  <TooltipContent side='bottom'>{t('menu.settings')}</TooltipContent>
                </Tooltip>
              </header>

            <div className='mt-7 grid min-h-[390px] overflow-hidden rounded-2xl border border-border/80 bg-[var(--surface-panel)] md:grid-cols-[300px_minmax(0,1fr)]'>
              <aside className='flex flex-col border-b border-border/80 bg-[var(--surface-titlebar)]/55 p-6 md:border-r md:border-b-0'>
                <span className='grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground'>
                  <FolderPlus className='size-[18px]' />
                </span>
                <h2 className='mt-5 text-[15px] font-semibold tracking-[-0.02em]'>
                  {t('start.newProject')}
                </h2>
                <p className='mt-1 max-w-[30ch] text-[11px] leading-[1.6] text-muted-foreground'>
                  {t('start.newDescription')}
                </p>

                <form className='mt-6 grid gap-2.5' onSubmit={createProject}>
                  <label htmlFor='project-name' className='text-[10px] font-medium text-foreground'>
                    {t('start.projectName')}
                  </label>
                  <Input
                    id='project-name'
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t('start.projectNamePlaceholder')}
                    aria-label={t('start.projectName')}
                    autoComplete='off'
                    disabled={busy !== null}
                    className='h-9 bg-background text-[11px]'
                  />
                  <Button
                    type='submit'
                    size='sm'
                    className='h-9 justify-center gap-1.5 text-[11px]'
                    disabled={!name.trim() || busy !== null}
                  >
                    <Plus className='size-3.5' />
                    {t('start.create')}
                  </Button>
                </form>

                <p className='mt-auto pt-8 text-[10px] leading-4 text-muted-foreground'>
                  {t('start.storageHint')}
                </p>
              </aside>

              <section
                className='flex min-h-[320px] min-w-0 flex-col'
                aria-labelledby='project-list-title'
              >
                  {selectionMode ? (
                    <header className='flex h-14 shrink-0 items-center border-b border-border/70 px-5 bg-[var(--surface-titlebar)]/50'>
                      <Checkbox
                        id='select-all'
                        checked={selectedProjects.size === currentProjects.length && currentProjects.length > 0}
                        onCheckedChange={() => toggleSelectAll(currentProjects)}
                        aria-label={t('start.select')}
                        disabled={busy !== null}
                      />
                      <span className='ml-2 text-[12px] font-semibold text-muted-foreground'>
                        {t('start.selectedCount', { count: selectedProjects.size })}
                      </span>
                      <div className='ml-auto flex items-center gap-2'>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='h-8 gap-1.5 text-[11px]'
                          onClick={clearSelection}
                          disabled={busy !== null}
                        >
                          <X className='size-3.5' />
                          {t('start.deselect')}
                        </Button>
                        {isArchivedView ? (
                          <>
                            <Button
                              type='button'
                              variant='default'
                              size='sm'
                              className='h-8 gap-1.5 text-[11px]'
                              onClick={bulkRestore}
                              disabled={busy !== null || selectedProjects.size === 0}
                            >
                              <RotateCcw className='size-3.5' />
                              {t('start.bulkRestore', { count: selectedProjects.size })}
                            </Button>
                            <Button
                              type='button'
                              variant='destructive'
                              size='sm'
                              className='h-8 gap-1.5 text-[11px]'
                              onClick={bulkDelete}
                              disabled={busy !== null || selectedProjects.size === 0}
                            >
                              <Trash2 className='size-3.5' />
                              {t('start.bulkDelete', { count: selectedProjects.size })}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type='button'
                              variant='default'
                              size='sm'
                              className='h-8 gap-1.5 text-[11px]'
                              onClick={bulkArchive}
                              disabled={busy !== null || selectedProjects.size === 0}
                            >
                              <Archive className='size-3.5' />
                              {t('start.bulkArchive', { count: selectedProjects.size })}
                            </Button>
                            <Button
                              type='button'
                              variant='destructive'
                              size='sm'
                              className='h-8 gap-1.5 text-[11px]'
                              onClick={bulkDelete}
                              disabled={busy !== null || selectedProjects.size === 0}
                            >
                              <Trash2 className='size-3.5' />
                              {t('start.bulkDelete', { count: selectedProjects.size })}
                            </Button>
                          </>
                        )}
                      </div>
                    </header>
                  ) : (
                    <header className='flex h-14 shrink-0 items-center border-b border-border/70 px-5'>
                      <h2 id='project-list-title' className='text-[12px] font-semibold'>
                        {isArchivedView ? t('start.archivedProjects') : t('start.yourProjects')}
                      </h2>
                      <span className='ml-2 rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground tabular-nums'>
                        {currentProjects.length}
                      </span>
                      <div className='ml-auto flex items-center gap-2'>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type='button'
                                variant={showArchives ? 'default' : 'ghost'}
                                size='sm'
                                className='h-8 gap-1.5 text-[11px]'
                                aria-label={showArchives ? t('start.hideArchives') : t('start.viewArchives')}
                                onClick={() => {
                                  setShowArchives(!showArchives)
                                  setSelectedProjects(new Set())
                                  setSelectionMode(false)
                                }}
                                disabled={busy !== null}
                              >
                                <Archive className='size-3.5' />
                                {showArchives ? t('start.hideArchives') : t('start.viewArchives')}
                                <span className='rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground tabular-nums'>
                                  {archivedProjects.length}
                                </span>
                              </Button>
                            }
                          >
                            <TooltipContent side='bottom'>
                              {showArchives ? t('start.hideArchives') : t('start.viewArchives')}
                            </TooltipContent>
                          </TooltipTrigger>
                        </Tooltip>
                      </div>
                    </header>
                  )}

                <ScrollArea
                  className='min-h-0 flex-1'
                  viewportClassName='p-2'
                  aria-busy={busy === 'list'}
                >
                  {busy === 'list' && currentProjects.length === 0 ? (
                    <p className='grid min-h-full place-items-center text-[11px] text-muted-foreground'>
                      {t('start.loadingProjects')}
                    </p>
                  ) : currentProjects.length === 0 ? (
                    <div
                      className='grid min-h-full place-items-center px-6 text-center'
                      role='status'
                    >
                      <div>
                        <span className='mx-auto grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground'>
                          {isArchivedView ? <Archive className='size-[18px]' /> : <Folder className='size-[18px]' />}
                        </span>
                        <p className='mt-3 text-[12px] font-medium'>
                          {isArchivedView ? t('start.noArchivedProjects') : t('start.emptyTitle')}
                        </p>
                        <p className='mt-1 text-[10px] leading-4 text-muted-foreground'>
                          {isArchivedView ? t('start.archiveEmptyDescription') : t('start.emptyDescription')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <ul className='grid gap-0.5' aria-label={t('start.projectList')}>
                      {currentProjects.map((project) => (
                        <li
                          key={project.name}
                          className={`group flex min-w-0 items-center rounded-lg hover:bg-foreground/[0.045] ${selectionMode ? 'bg-[var(--surface-titlebar)]/30' : ''}`}
                        >
                          {selectionMode && (
                            <Checkbox
                              id={`select-${project.name}`}
                              checked={selectedProjects.has(project.name)}
                              onCheckedChange={() => toggleProjectSelection(project.name)}
                              aria-label={selectedProjects.has(project.name) ? t('start.deselect') : t('start.select')}
                              disabled={busy !== null}
                              className='mr-2 shrink-0'
                            />
                          )}
                          <button
                            type='button'
                            className='flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                            onClick={() => selectionMode ? toggleProjectSelection(project.name) : void openProject(project.name).catch(() => undefined)}
                            disabled={busy !== null}
                          >
                            <span className='grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground'>
                              <Folder className='size-4' />
                            </span>
                            <span className='min-w-0 flex-1'>
                              <span className='block truncate text-[11px] font-medium'>
                                {project.name}
                              </span>
                              <div className='mt-0.5 flex items-center gap-2 text-[9px] text-muted-foreground'>
                                <span>{t('start.projectKind')}</span>
                                {project.size_bytes > 0 && (
                                  <span className='flex items-center gap-1'>
                                    <span className='hidden sm:inline'>{t('start.projectSize', { size: formatBytes(project.size_bytes) })}</span>
                                    <span className='hidden md:inline'>{t('start.lastModified', { date: formatDate(project.last_modified) })}</span>
                                  </span>
                                )}
                              </div>
                            </span>
                          </button>
                          {!selectionMode && (
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    type='button'
                                    size='icon-sm'
                                    variant='ghost'
                                    className='mr-2 size-7 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100'
                                    aria-label={isArchivedView ? t('start.restoreLabel', { name: project.name }) : t('start.archiveLabel', { name: project.name })}
                                    disabled={busy !== null}
                                  />
                                }
                              >
                                <MoreHorizontal className='size-3.5' />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align='end' className='w-40'>
                                {isArchivedView ? (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        restoreProject(project.name)
                                      }}
                                      disabled={busy !== null}
                                    >
                                      <RotateCcw className='size-3.5 mr-2' />
                                      {t('start.restore')}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      variant='destructive'
                                      onClick={() => setProjectToDelete(project.name)}
                                      disabled={busy !== null}
                                    >
                                      <Trash2 className='size-3.5 mr-2' />
                                      {t('start.deleteArchivedAction')}
                                    </DropdownMenuItem>
                                  </>
                                ) : (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        archiveProject(project.name)
                                      }}
                                      disabled={busy !== null}
                                    >
                                      <Archive className='size-3.5 mr-2' />
                                      {t('start.archive')}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      variant='destructive'
                                      onClick={() => setProjectToDelete(project.name)}
                                      disabled={busy !== null}
                                    >
                                      <Trash2 className='size-3.5 mr-2' />
                                      {t('start.deleteAction')}
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </section>
            </div>
          </section>
        </ScrollArea>
      </main>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className='bg-destructive/10 text-destructive'>
            <Trash2 className='size-5' />
          </AlertDialogMedia>
          <AlertDialogTitle>{isArchivedView ? t('start.deleteArchivedTitle') : t('start.deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {isArchivedView
              ? t('start.deleteArchivedDescription', { name: projectToDelete })
              : t('start.deleteDescription', { name: projectToDelete })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy !== null}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            disabled={busy !== null}
            aria-busy={busy !== null}
            onClick={() => void deleteProject().catch(() => undefined)}
          >
            {busy !== null ? t('start.deleting') : (isArchivedView ? t('start.deleteArchivedAction') : t('start.deleteAction'))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
