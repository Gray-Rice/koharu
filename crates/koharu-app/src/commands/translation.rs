use anyhow::{Context as _, Result};
use koharu_desktop::{CanvasState, Desktop};
use koharu_scene::{Authored, EntityId, Snapshot, Translation as SceneTranslation};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use tauri::{State, WebviewWindow};
use tauri_runtime_cef::CefRuntime;

use super::{
    ChannelExt as _, Error,
    canvas::CanvasChannel,
    project::CurrentProject,
};

async fn synchronize_canvas(
    desktop: &Desktop,
    commit: &koharu_scene::Commit,
    page: Option<EntityId>,
) -> anyhow::Result<CanvasState> {
    desktop.synchronize(&commit.snapshot, page, commit).await?;
    Ok(desktop.canvas_state())
}

/// Export format for translations across pages
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct TranslationExport {
    pub version: String,
    pub pages: Vec<(String, PageTranslationExport)>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct PageTranslationExport {
    pub source_language: Option<String>,
    pub target_language: String,
    pub segments: Vec<TranslationSegmentExport>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct TranslationSegmentExport {
    pub id: u32,
    pub source: String,
    pub translation: Option<String>,
}

/// Import format for translations
#[derive(Clone, Debug, Deserialize, Type)]
#[allow(dead_code)]
pub struct TranslationImport {
    pub version: Option<String>,
    pub pages: Option<Vec<(String, PageTranslationImport)>>,
}

#[derive(Clone, Debug, Deserialize, Type)]
#[allow(dead_code)]
pub struct PageTranslationImport {
    pub target_language: Option<String>,
    pub segments: Option<Vec<TranslationSegmentImport>>,
}

#[derive(Clone, Debug, Deserialize, Type)]
pub struct TranslationSegmentImport {
    pub id: u32,
    pub translation: String,
}

/// Export translations for all pages or specified pages
#[tracing::instrument(
    target = "koharu_metrics",
    name = "export_translations",
    skip_all,
    fields(origin = "user"),
)]
#[tauri::command]
#[specta::specta]
pub(crate) async fn export_translations(
    window: WebviewWindow<CefRuntime>,
    pages: Option<Vec<EntityId>>,
    project: State<'_, CurrentProject>,
) -> std::result::Result<(), Error> {
    let snapshot = {
        let project = project.project.lock().await;
        let project = project.as_ref().context("no project is open")?;
        project.snapshot()
    };

    let export_data = build_translation_export(&snapshot, pages).await?;

    let Some(path) = rfd::AsyncFileDialog::new()
        .add_filter("JSON", &["json"])
        .set_file_name("translations.json")
        .set_parent(&window)
        .save_file()
        .await
        .map(|file| file.path().to_owned())
    else {
        return Ok(());
    };

    let json = serde_json::to_string_pretty(&export_data)
        .context("failed to serialize translation export")?;

    tokio::fs::write(&path, json)
        .await
        .with_context(|| format!("failed to write translations to {}", path.display()))?;

    Ok(())
}

/// Import translations from a JSON file
#[tracing::instrument(
    target = "koharu_metrics",
    name = "import_translations",
    skip_all,
    fields(origin = "user"),
)]
#[tauri::command]
#[specta::specta]
pub(crate) async fn import_translations(
    window: WebviewWindow<CefRuntime>,
    desktop: State<'_, Desktop>,
    project: State<'_, CurrentProject>,
    canvas_channel: State<'_, CanvasChannel>,
) -> std::result::Result<(), Error> {
    let Some(file) = rfd::AsyncFileDialog::new()
        .add_filter("JSON", &["json"])
        .set_parent(&window)
        .pick_file()
        .await
        .map(|file| file.path().to_owned())
    else {
        return Ok(());
    };

    let json = tokio::fs::read_to_string(&file)
        .await
        .with_context(|| format!("failed to read translations from {}", file.display()))?;

    let import_data: TranslationImport = serde_json::from_str(&json)
        .context("failed to parse translation import JSON")?;

    let mut project = project.project.lock().await;
    let project = project.as_mut().context("no project is open")?;

    let snapshot = project.session.snapshot();
    let pages_to_process = import_data
        .pages
        .as_ref()
        .context("import data must contain pages")?;

    // Collect page IDs that will be affected
    let page_label_to_id: HashMap<String, EntityId> = snapshot
        .pages()
        .filter_map(|page_entity| {
            page_entity
                .page()
                .ok()
                .map(|page| (page.label.clone(), page_entity.id()))
        })
        .collect();

    let mut affected_pages = Vec::new();
    for (page_label, _) in pages_to_process {
        if let Some(&page_id) = page_label_to_id.get(page_label) {
            affected_pages.push(page_id);
        }
    }

    let commits = apply_translation_import(&mut project.session, import_data).await?;

    // Synchronize canvas for each affected page using the returned commits
    for (page_id, commit) in commits {
        let canvas = synchronize_canvas(&desktop, &commit, Some(page_id)).await?;
        canvas_channel.channel.publish(canvas);
    }

    Ok(())
}

async fn build_translation_export(
    snapshot: &Snapshot,
    pages: Option<Vec<EntityId>>,
) -> Result<TranslationExport> {
    let mut pages_to_export: Vec<EntityId> = if let Some(pages) = pages {
        pages
    } else {
        snapshot.pages().map(|page| page.id()).collect()
    };

    if pages_to_export.is_empty() {
        pages_to_export = snapshot.pages().map(|page| page.id()).collect();
    }

    let mut pages_vec = Vec::new();

    for page_id in pages_to_export {
        let page_entity = snapshot.page(page_id)?;
        let page_label = page_entity.page()?.label;

        let text_group = match page_entity.text_group() {
            Ok(Some(group)) => group,
            Ok(None) => continue,
            Err(_) => continue,
        };

        let mut segments = Vec::new();
        let mut segment_id = 0;

        for layer in text_group.text_layers()? {
            let content = layer.content()?;
            let source = match content.source()? {
                Some(source) => source,
                None => continue,
            };

            let source_text = source.text.value.clone();
            if source_text.trim().is_empty() {
                continue;
            }

            let translation = content.translation()?;
            let translation_text = translation.map(|t| t.text.value.clone());

            segments.push(TranslationSegmentExport {
                id: segment_id,
                source: source_text,
                translation: translation_text,
            });

            segment_id += 1;
        }

        if !segments.is_empty() {
            pages_vec.push((
                page_label,
                PageTranslationExport {
                    source_language: None, // Could be extracted if available
                    target_language: String::from("unknown"),
                    segments,
                },
            ));
        }
    }

    Ok(TranslationExport {
        version: "1.0".to_string(),
        pages: pages_vec,
    })
}

async fn apply_translation_import(
    session: &mut koharu_scene::Session,
    import_data: TranslationImport,
) -> Result<Vec<(EntityId, koharu_scene::Commit)>> {
    let snapshot = session.snapshot();

    let pages_to_process = import_data
        .pages
        .context("import data must contain pages")?;

    if pages_to_process.is_empty() {
        anyhow::bail!("no pages to import");
    }

    // Build a map of page labels to IDs
    let page_label_to_id: HashMap<String, EntityId> = snapshot
        .pages()
        .filter_map(|page_entity| {
            page_entity
                .page()
                .ok()
                .map(|page| (page.label.clone(), page_entity.id()))
        })
        .collect();

    let mut commits = Vec::new();

    for (page_label, page_data) in pages_to_process.into_iter() {
        let Some(&page_id) = page_label_to_id.get(&page_label) else {
            tracing::warn!("page '{}' not found in project, skipping", page_label);
            continue;
        };

        let segments_to_import = match page_data.segments {
            Some(segments) => segments,
            None => continue,
        };

        if segments_to_import.is_empty() {
            continue;
        }

        if let Some(commit) = apply_page_translations(session, page_id, segments_to_import).await? {
            commits.push((page_id, commit));
        }
    }

    Ok(commits)
}

async fn apply_page_translations(
    session: &mut koharu_scene::Session,
    page_id: EntityId,
    segments_to_import: Vec<TranslationSegmentImport>,
) -> Result<Option<koharu_scene::Commit>> {
    let snapshot = session.snapshot();
    let page_entity = snapshot.page(page_id)?;
    let text_group = match page_entity.text_group() {
        Ok(Some(group)) => group,
        _ => return Ok(None),
    };

    // Build a map of segment ID to translation
    let translations_map: HashMap<u32, String> = segments_to_import
        .into_iter()
        .map(|segment| (segment.id, segment.translation))
        .collect();

    let mut segment_id: u32 = 0;
    let mut content_ids_and_translations: Vec<(EntityId, String)> = Vec::new();

    for layer in text_group.text_layers()? {
        let content = layer.content()?;
        let source = match content.source()? {
            Some(source) => source,
            None => continue,
        };

        if source.text.value.trim().is_empty() {
            continue;
        }

        if let Some(translation_text) = translations_map.get(&segment_id) {
            content_ids_and_translations.push((content.id(), translation_text.clone()));
        }

        segment_id += 1;
    }

    // Apply all translations in a single patch
    if !content_ids_and_translations.is_empty() {
        let patch = snapshot.patch(|edit| {
            for (content_id, translation_text) in content_ids_and_translations {
                edit.promote_entity_to_user(content_id)?;
                // Try to get existing language
                let language = snapshot
                    .component::<SceneTranslation>(content_id)
                    .ok()
                    .flatten()
                    .and_then(|translation| translation.language);

                edit.set(
                    content_id,
                    &SceneTranslation {
                        text: Authored::user(translation_text),
                        language,
                    },
                )?;
            }
            Ok(())
        })?;

        let commit = session.commit(patch).await?;
        return Ok(Some(commit));
    }

    Ok(None)
}

/// Import translations directly from JSON data (without file dialog)
#[tracing::instrument(
    target = "koharu_metrics",
    name = "import_translations_from_data",
    skip_all,
    fields(origin = "user"),
)]
#[tauri::command]
#[specta::specta]
pub(crate) async fn import_translations_from_data(
    data: TranslationImport,
    desktop: State<'_, Desktop>,
    project: State<'_, CurrentProject>,
    canvas_channel: State<'_, CanvasChannel>,
) -> std::result::Result<(), Error> {
    let mut project = project.project.lock().await;
    let project = project.as_mut().context("no project is open")?;

    let snapshot = project.session.snapshot();
    let pages_to_process = data
        .pages
        .as_ref()
        .context("import data must contain pages")?;

    // Collect page IDs that will be affected
    let page_label_to_id: HashMap<String, EntityId> = snapshot
        .pages()
        .filter_map(|page_entity| {
            page_entity
                .page()
                .ok()
                .map(|page| (page.label.clone(), page_entity.id()))
        })
        .collect();

    let mut affected_pages = Vec::new();
    for (page_label, _) in pages_to_process {
        if let Some(&page_id) = page_label_to_id.get(page_label) {
            affected_pages.push(page_id);
        }
    }

    let commits = apply_translation_import(&mut project.session, data).await?;

    // Synchronize canvas for each affected page using the returned commits
    for (page_id, commit) in commits {
        let canvas = synchronize_canvas(&desktop, &commit, Some(page_id)).await?;
        canvas_channel.channel.publish(canvas);
    }

    Ok(())
}
