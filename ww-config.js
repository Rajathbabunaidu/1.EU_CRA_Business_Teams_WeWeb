// WeWeb coded-element editor settings. Credentials are supplied inside the WeWeb editor.
export default {
  editor: {
    label: { en: 'EU CRA Hub — Business Teams' },
    icon: 'users',
  },
  properties: {
    supabaseUrl: {
      label: { en: 'Supabase Project URL' },
      type: 'Text',
      defaultValue: '',
    },
    supabasePublishableKey: {
      label: { en: 'Supabase Publishable Key (sb_publishable_...)' },
      type: 'Text',
      defaultValue: '',
    },
    defaultPageSize: {
      label: { en: 'Default rows per page (10 / 25 / 50 / 100)' },
      type: 'Number',
      defaultValue: 10,
    },
    enableEditing: {
      label: { en: 'Enable Add and Edit Team' },
      type: 'OnOff',
      defaultValue: true,
    },
    enableCustomFields: {
      label: { en: 'Enable Custom Fields (when backend permits)' },
      type: 'OnOff',
      defaultValue: true,
    },
    showBreadcrumbs: {
      label: { en: 'Show Page Breadcrumbs' },
      type: 'OnOff',
      defaultValue: true,
    },
    showMembershipKpi: {
      label: { en: 'Show Total Memberships KPI' },
      type: 'OnOff',
      defaultValue: false,
    },
  },
};
