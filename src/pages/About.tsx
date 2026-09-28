import React from 'react';
import { Mail, HardDrive, ShieldCheck, Database, FileArchive } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card, Badge } from '../components/ui';
import { APP_VERSION, APP_ID } from '@shared/constants';

export function About() {
  const { info } = useApp();

  const Row = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--c-border)' }}>
      <span style={{ color: 'var(--c-text-3)', marginTop: 2 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: 'var(--fs-body)', marginTop: 2, wordBreak: 'break-word' }}>{value}</div>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 22, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
        <img src="./icon/icon.png" alt="Dentiva Pro" style={{ width: 64, height: 64, borderRadius: 16 }} />
        <div>
          <h1 style={{ fontSize: 'var(--fs-h1)', fontWeight: 700 }}>Dentiva Pro</h1>
          <div style={{ color: 'var(--c-text-2)', fontSize: 'var(--fs-small)' }}>
            Offline dental practice management for Bangladesh · Version {APP_VERSION}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <Badge tone="success">Fully offline</Badge>
            <Badge tone="info">BDT ৳</Badge>
            <Badge tone="primary">Role-based security</Badge>
          </div>
        </div>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <strong style={{ fontSize: 'var(--fs-body)' }}>About this software</strong>
        <p style={{ fontSize: 'var(--fs-body)', color: 'var(--c-text-2)', lineHeight: 1.65, marginTop: 8, marginBottom: 0 }}>
          Dentiva Pro is a complete, offline desktop application for running a dental practice: patient records, dental charts
          (FDI & Universal, adult and pediatric), appointments and queue, visits, prescriptions, immutable invoicing, payments in
          ৳ BDT, accounting, inventory, staff and role-based access with full audit logging, plus verified backup and restore.
          Your data never leaves this computer.
        </p>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <strong style={{ fontSize: 'var(--fs-body)' }}>Developer</strong>
        <div style={{ marginTop: 10 }}>
          <Row icon={<Mail size={16} />} label="Developer" value={
            <span>
              Shohan Khan ·{' '}
              <a href="mailto:helloiamshohan@gmail.com" style={{ color: 'var(--c-primary)', fontWeight: 600 }}>helloiamshohan@gmail.com</a>
            </span>
          } />
          <Row icon={<ShieldCheck size={16} />} label="Licensing" value="Licensed commercial software. One installation per licensed practice. Activation is verified offline on this machine." />
          <Row icon={<HardDrive size={16} />} label="Activation" value={info?.activated ? <Badge tone="success">Activated {info.activatedAt ? `on ${new Date(info.activatedAt).toLocaleDateString()}` : ''}</Badge> : 'Not activated'} />
        </div>
      </Card>

      <Card>
        <strong style={{ fontSize: 'var(--fs-body)' }}>Installation & data</strong>
        <div style={{ marginTop: 10 }}>
          <Row icon={<Database size={16} />} label="Application" value={`${APP_ID} v${APP_VERSION} — this build`} />
          <Row icon={<HardDrive size={16} />} label="Data location" value={info?.dataDir ?? '—'} />
          <Row icon={<Database size={16} />} label="Database size" value={info ? `${(info.dbSizeBytes / 1024 / 1024).toFixed(2)} MB` : '—'} />
          <Row icon={<FileArchive size={16} />} label="Attachments" value={`${info?.attachmentCount ?? 0} files`} />
          <Row icon={<FileArchive size={16} />} label="Last backup" value={info?.lastBackupAt ? `${new Date(info.lastBackupAt).toLocaleString()} (${info.lastBackupStatus})` : 'No backup recorded yet'} />
        </div>
      </Card>

      <div style={{ marginTop: 16, fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', textAlign: 'center' }}>
        Dentiva Pro {APP_VERSION} · Built for offline dental practices in Bangladesh · Data stays on this computer
      </div>
    </div>
  );
}
