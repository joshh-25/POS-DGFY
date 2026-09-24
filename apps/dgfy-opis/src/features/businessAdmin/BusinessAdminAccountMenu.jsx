import React from 'react';
import { Link } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { DGFY_COMPANY_SELECT_ROUTE } from '../../../../../packages/web-core/src/features/dgfyRouteHelpers.js';
import { logout } from '../../../../../packages/web-core/src/services/authService.js';

const BusinessAdminAccountMenu = ({ user, business }) => {
    const identity = user?.username || user?.email || 'User';
    const businessName = business?.name || 'Business';

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="business-admin-chip"
                    aria-label={`Account: ${identity}`}
                    aria-haspopup="true"
                >
                    <UserRound size={13} /> {identity}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" aria-label="Account menu">
                <DropdownMenuLabel>Logged in as {identity} at {businessName}</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                    <Link to={DGFY_COMPANY_SELECT_ROUTE}>Switch business</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => { void logout({ redirectTo: '/dgfy/auth' }); }}
                    >
                        Logout
                    </button>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default BusinessAdminAccountMenu;
