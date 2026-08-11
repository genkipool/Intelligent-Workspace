mkdir -p src/ui/pages/rules/components

cat << 'SVELTE' > src/ui/pages/rules/components/UrlSpan.svelte
<script>export let text = '';</script>
<span class="rule-urls" data-i18n="noUrlsAssociated">{text}</span>
SVELTE

cat << 'SVELTE' > src/ui/pages/rules/components/UrlWrapper.svelte
<div class="rule-urls-wrapper"></div>
SVELTE

cat << 'SVELTE' > src/ui/pages/rules/components/UrlLink.svelte
<script>export let href = ''; export let displayText = '';</script>
<a {href} class="rule-urls" target="_blank" rel="noopener noreferrer" tabindex="0">{displayText}</a>
SVELTE

cat << 'SVELTE' > src/ui/pages/rules/components/MoreButton.svelte
<script>export let count = 0;</script>
<button class="rule-urls more-btn" tabindex="0">+{count}</button>
SVELTE

cat << 'SVELTE' > src/ui/pages/rules/components/CollapseButton.svelte
<button class="collapse-btn" tabindex="0" data-i18n-aria-label="collapseSection" data-i18n-title="collapseSection">
  <span class="svg-deploy">
    <svg width="28" height="28" viewBox="0 0 24 24" style="color: var(--text-on-color);" aria-hidden="true" focusable="false">
      <use href="#icon-chevron-down"></use>
    </svg>
  </span>
</button>
SVELTE

cat << 'SVELTE' > src/ui/pages/rules/components/Tooltip.svelte
<script>export let text = '';</script>
<div class="tooltip">{text}</div>
SVELTE

cat << 'SVELTE' > src/ui/pages/rules/components/InlineInput.svelte
<script>export let value = '';</script>
<input type="text" {value} />
SVELTE

cat << 'SVELTE' > src/ui/pages/rules/components/InlineSpan.svelte
<script>export let text = '';</script>
<span>{text}</span>
SVELTE

