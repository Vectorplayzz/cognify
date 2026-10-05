import React, { useCallback, useRef, useState } from 'react';
import { Button, Modal } from './index';

interface ConfirmOptions {
    title: string;
    description?: React.ReactNode;
    confirmLabel?: string;
    danger?: boolean;
}

/** Promise-based replacement for window.confirm, rendered as a themed modal. */
export function useConfirm(): [React.ReactNode, (opts: ConfirmOptions) => Promise<boolean>] {
    const [opts, setOpts] = useState<ConfirmOptions | null>(null);
    const resolver = useRef<(v: boolean) => void>(() => {});

    const confirm = useCallback((o: ConfirmOptions) => {
        setOpts(o);
        return new Promise<boolean>((resolve) => { resolver.current = resolve; });
    }, []);

    const close = (v: boolean) => {
        resolver.current(v);
        setOpts(null);
    };

    const node = (
        <Modal open={!!opts} onClose={() => close(false)} title={opts?.title} description={opts?.description}>
            <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
                <Button variant={opts?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
                    {opts?.confirmLabel || 'Confirm'}
                </Button>
            </div>
        </Modal>
    );
    return [node, confirm];
}
