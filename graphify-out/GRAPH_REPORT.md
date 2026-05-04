# Graph Report - .  (2026-05-03)

## Corpus Check
- Corpus is ~24,097 words - fits in a single context window. You may not need a graph.

## Summary
- 105 nodes · 181 edges · 12 communities detected
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_UI Specs & Data Schema|UI Specs & Data Schema]]
- [[_COMMUNITY_Core App Functions|Core App Functions]]
- [[_COMMUNITY_Auth & User Management|Auth & User Management]]
- [[_COMMUNITY_Utilities & Permissions|Utilities & Permissions]]
- [[_COMMUNITY_Category Management|Category Management]]
- [[_COMMUNITY_Three-View System|Three-View System]]
- [[_COMMUNITY_Graph Analysis Results|Graph Analysis Results]]
- [[_COMMUNITY_Auth UI & Theme|Auth UI & Theme]]
- [[_COMMUNITY_EUR Rate Widget|EUR Rate Widget]]
- [[_COMMUNITY_Confirm Modal|Confirm Modal]]
- [[_COMMUNITY_Permission Editor Modal|Permission Editor Modal]]
- [[_COMMUNITY_Permission Toggle Rows|Permission Toggle Rows]]

## God Nodes (most connected - your core abstractions)
1. `Stok Yonetim Dashboard Blueprint` - 18 edges
2. `Supabase Client (sb + sbAdmin)` - 17 edges
3. `products[] global state` - 17 edges
4. `renderAll()` - 11 edges
5. `renderTable()` - 10 edges
6. `categories[] global state` - 8 edges
7. `General UI Layout Spec (header, stats, charts, table)` - 8 edges
8. `enterApp()` - 7 edges
9. `submitProductForm()` - 7 edges
10. `3 Views Requirement (Editor, Landing, App)` - 7 edges

## Surprising Connections (you probably didn't know these)
- `GRAPH_REPORT.md Community Detection Results` --references--> `Stok Yonetim Dashboard Blueprint`  [EXTRACTED]
  graphify-out/GRAPH_REPORT.md → CLAUDE.md
- `Knowledge Gaps isolated nodes and thin communities` --conceptually_related_to--> `Calculated Fields (profit, margin, stockValue, daysUntilOut)`  [EXTRACTED]
  graphify-out/GRAPH_REPORT.md → CLAUDE.md
- `Knowledge Gaps isolated nodes and thin communities` --conceptually_related_to--> `4 Stat Cards Spec`  [EXTRACTED]
  graphify-out/GRAPH_REPORT.md → CLAUDE.md
- `Knowledge Gaps isolated nodes and thin communities` --conceptually_related_to--> `Pie/Donut Chart Spec (categories)`  [EXTRACTED]
  graphify-out/GRAPH_REPORT.md → CLAUDE.md

## Hyperedges (group relationships)
- **Supabase Authentication Flow** — index_supabase_client, index_handle_auth_submit, index_handle_logout, index_bootstrap_auth, index_enter_app, index_exit_app, index_current_user [EXTRACTED 0.95]
- **renderAll() rendering pipeline** — index_render_all, index_render_stats, index_render_pie, index_render_bar, index_render_table [EXTRACTED 1.00]
- **Category CRUD with cascading rename/delete** — index_open_category_modal, index_render_category_list, index_submit_new_category, index_commit_category_rename, index_ask_delete_category, index_cycle_category_color, index_categories_state [EXTRACTED 0.90]
- **RBAC Permission System** — index_rbac_config, index_current_permissions, index_load_user_permissions, index_apply_permissions, index_is_admin, index_can_do, index_is_view_only, index_open_perm_editor [EXTRACTED 0.95]
- **EUR/TRY Rate Live Fetch + Cache Flow** — index_eur_rate, index_eur_rate_widget, index_eur_rate_key, index_render_stats, index_submit_product_form, index_update_stockout_profit [INFERRED 0.85]
- **Admin Panel — User Management & Audit Logs** — index_admin_panel, index_open_admin_panel, index_load_admin_users, index_load_audit_logs, index_handle_create_user, index_open_perm_editor, index_log_action [EXTRACTED 0.90]
- **3-View Tab + Browser Frame System** — claudemd_three_views_requirement, claudemd_tab_system, claudemd_browser_frame_css, claudemd_view_editor, claudemd_view_landing, claudemd_view_app, claudemd_reactive_updates_rationale [EXTRACTED 0.95]
- **Product Data Model Schema + Calculations + Status Logic** — claudemd_product_object_schema, claudemd_calculated_fields, claudemd_status_auto_update, claudemd_sku_autosuggest_note [EXTRACTED 0.92]
- **UI Specification Cluster Layout Color Animation** — claudemd_ui_layout_spec, claudemd_dark_color_palette, claudemd_animation_spec, claudemd_responsive_breakpoints, claudemd_stat_cards_spec, claudemd_pie_chart_spec, claudemd_bar_chart_spec [INFERRED 0.85]

## Communities

### Community 0 - "UI Specs & Data Schema"
Cohesion: 0.2
Nodes (21): Animation Decisions (counters, fadeIn, pieIn), Bar Chart Spec (top 8 sales), Calculated Fields (profit, margin, stockValue, daysUntilOut), CSV Export Spec (UTF-8 BOM, Turkish headers), Dark Color Palette (--bg-primary, --accent etc), Filter Bar Spec, localStorage Keys Spec, Pie/Donut Chart Spec (categories) (+13 more)

### Community 1 - "Core App Functions"
Cohesion: 0.15
Nodes (18): askDelete(id) / doDelete(id), askDeleteCategory(), currentUser global state, eurRate global + fetchAndUpdateEurRate(), EUR_RATE_KEY localStorage constant, exportCSV() UTF-8 BOM, semicolon, TR commas, logAction() audit logger, openEditModal(id) (+10 more)

### Community 2 - "Auth & User Management"
Cohesion: 0.15
Nodes (17): Admin Panel UI (users + logs tabs), bootstrapAuth(), dbToProduct() row mapper, enterApp(), exitApp(), handleAuthSubmit(), handleCreateUser() via sbAdmin, handleLogout() (+9 more)

### Community 3 - "Utilities & Permissions"
Cohesion: 0.21
Nodes (14): animateCounter() rAF easeOut, applyPermissions(), calcStatus() (out_of_stock/low_stock/active), canDo(action) permission check, currentPermissions global state, escapeHtml() XSS util, fmtTL / fmtEUR / fmtTLShort / fmtEURShort formatters, getFiltered() search + filter + sort (+6 more)

### Community 4 - "Category Management"
Cohesion: 0.19
Nodes (13): categories[] global state, Category Management Modal UI, CATEGORY_PALETTE color array, commitCategoryRename() cascading rename, cycleCategoryColor(), getCategoryColor(), openCategoryModal(), renderAll() (+5 more)

### Community 5 - "Three-View System"
Cohesion: 0.43
Nodes (8): Browser Frame CSS Spec (mac-style dots), Landing Content Generation rationale (sector-based), Reactive Updates rationale (single state to 3 views), Tab System (switchView function), 3 Views Requirement (Editor, Landing, App), View 3: Customer-facing Full UI, View 1: Editor (default dashboard view), View 2: Landing Page (browser frame mockup)

### Community 6 - "Graph Analysis Results"
Cohesion: 0.4
Nodes (5): 26 Communities (Admin, Category, Dashboard, Render, CRUD, RBAC, EUR), God Nodes (renderAll, products[], renderPie, renderTable, calcStatus), Hyperedges (Auth Flow, renderAll pipeline, Category CRUD, RBAC, Tables, EUR, Admin), GRAPH_REPORT.md Community Detection Results, Surprising Connections (schema to implementation inferred edges)

### Community 7 - "Auth UI & Theme"
Cohesion: 1.0
Nodes (2): Auth Screen UI (login form), CSS Custom Properties (dark theme palette)

### Community 8 - "EUR Rate Widget"
Cohesion: 1.0
Nodes (1): EUR/TRY Rate Widget UI

### Community 9 - "Confirm Modal"
Cohesion: 1.0
Nodes (1): Confirm Modal UI

### Community 10 - "Permission Editor Modal"
Cohesion: 1.0
Nodes (1): Permission Editor Modal UI

### Community 11 - "Permission Toggle Rows"
Cohesion: 1.0
Nodes (1): Permission Editor Toggle Rows

## Knowledge Gaps
- **22 isolated node(s):** `Auth Screen UI (login form)`, `currentUser global state`, `Admin Panel UI (users + logs tabs)`, `animateCounter() rAF easeOut`, `CATEGORY_PALETTE color array` (+17 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Auth UI & Theme`** (2 nodes): `Auth Screen UI (login form)`, `CSS Custom Properties (dark theme palette)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `EUR Rate Widget`** (1 nodes): `EUR/TRY Rate Widget UI`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Confirm Modal`** (1 nodes): `Confirm Modal UI`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Permission Editor Modal`** (1 nodes): `Permission Editor Modal UI`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Permission Toggle Rows`** (1 nodes): `Permission Editor Toggle Rows`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Supabase Client (sb + sbAdmin)` connect `Auth & User Management` to `Core App Functions`, `Utilities & Permissions`, `Category Management`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **Why does `products[] global state` connect `Core App Functions` to `Auth & User Management`, `Utilities & Permissions`, `Category Management`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `Stok Yonetim Dashboard Blueprint` connect `UI Specs & Data Schema` to `Three-View System`, `Graph Analysis Results`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `products[] global state` (e.g. with `dbToProduct() row mapper` and `productToDb() row mapper`) actually correct?**
  _`products[] global state` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Auth Screen UI (login form)`, `currentUser global state`, `Admin Panel UI (users + logs tabs)` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._