<script>
    import { t } from '../../stores/i18nStore.js';

    let { onOpenAbout = () => {} } = $props();
</script>

<a
    href="#about"
    id="about-link-rules"
    class="footer-link"
    onclick={(e) => {
        e.preventDefault();
        onOpenAbout();
    }}
>
    <footer class="footer">
        <div>Intelligent Workspace v1.0.0</div>
        <div class="color-dots">
            <div class="color-dot" style="background-color: #5F6368;"></div>
            <div class="color-dot" style="background-color: #1A73E8;"></div>
            <div class="color-dot" style="background-color: #D93025;"></div>
            <div class="color-dot" style="background-color: #F9AB00;"></div>
            <div class="color-dot" style="background-color: #188038;"></div>
            <div class="color-dot" style="background-color: #D01884;"></div>
            <div class="color-dot" style="background-color: #A142F4;"></div>
            <div class="color-dot" style="background-color: #007B83;"></div>
            <div class="color-dot" style="background-color: #FA903E;"></div>
        </div>
        <div>{$t('developedBy') || 'Developed by'}</div>
    </footer>
</a>
