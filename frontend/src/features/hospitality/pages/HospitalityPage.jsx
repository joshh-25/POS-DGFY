import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BedDouble,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  DoorOpen,
  Hammer,
  Hotel,
  PackagePlus,
  Percent,
  Plus,
  RefreshCw,
  Sparkles,
  UserRound
} from 'lucide-react';
import { toast } from 'sonner';
import {
  addHospitalityFolioLine,
  createHospitalityAmenity,
  createHospitalityFacility,
  createHospitalityFacilityBooking,
  createHospitalityFolio,
  createHospitalityGuest,
  createHospitalityGuestMessage,
  createHospitalityHousekeepingTask,
  createHospitalityMaintenanceRequest,
  createHospitalityPackage,
  createHospitalityPackageItem,
  createHospitalityPropertyAmenity,
  createHospitalityRatePlan,
  createHospitalityReservation,
  createHospitalityRoom,
  createHospitalityRoomAmenity,
  createHospitalityRoomType,
  getHospitalityDashboard,
  getHospitalityReports,
  listHospitalityAmenities,
  listHospitalityFacilities,
  listHospitalityFolios,
  listHospitalityGuests,
  listHospitalityHousekeepingTasks,
  listHospitalityMaintenanceRequests,
  listHospitalityPackages,
  listHospitalityRatePlans,
  listHospitalityReservations,
  listHospitalityRooms,
  listHospitalityRoomTypes,
  listHospitalityStays,
  updateHospitalityHousekeepingTask,
  updateHospitalityMaintenanceRequest,
  updateHospitalityReservationRoom,
  updateHospitalityReservationStatus,
  updateHospitalityRoomStatus
} from '../api/hospitalityApi.js';

const tabs = [
  { key: 'today', label: 'Today', icon: Hotel },
  { key: 'reservations', label: 'Reservations', icon: CalendarDays },
  { key: 'rooms', label: 'Rooms', icon: BedDouble },
  { key: 'guests', label: 'Guests', icon: UserRound },
  { key: 'housekeeping', label: 'Housekeeping', icon: ClipboardCheck },
  { key: 'maintenance', label: 'Maintenance', icon: Hammer },
  { key: 'folios', label: 'Folios', icon: CreditCard },
  { key: 'amenities', label: 'Amenities', icon: Sparkles },
  { key: 'rates', label: 'Rates', icon: Percent },
  { key: 'reports', label: 'Reports', icon: DoorOpen }
];

const roomStatuses = ['vacant_clean', 'vacant_dirty', 'occupied_clean', 'occupied_dirty', 'inspected', 'out_of_order', 'out_of_service'];
const reservationStatuses = ['draft', 'confirmed', 'checked_in', 'in_house', 'checked_out', 'cancelled', 'no_show'];
const housekeepingStatuses = ['pending', 'in_progress', 'ready_for_inspection', 'inspected', 'blocked'];
const maintenanceStatuses = ['reported', 'assigned', 'in_progress', 'resolved', 'deferred'];
const amenityTypes = ['property', 'room', 'paid_add_on', 'facility', 'accessibility', 'policy', 'local_area', 'transport', 'meal', 'package'];

const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
};
const money = (value, currency = 'PHP') => `${currency} ${Number(value || 0).toFixed(2)}`;
const labelize = (value) => String(value || '').replace(/_/g, ' ');
const toArray = (value, keys = []) => {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
};

const inputClass = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';
const textAreaClass = 'min-h-[82px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60';

const Field = ({ label, children }) => (
  <label className="block text-xs font-semibold text-slate-600">
    {label}
    <div className="mt-1">{children}</div>
  </label>
);

const StatTile = ({ icon: Icon, label, value, hint }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-700">
        <Icon className="h-5 w-5" />
      </div>
    </div>
    {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
  </div>
);

const StatusBadge = ({ status }) => {
  const normalized = String(status || 'unknown');
  const tone = normalized.includes('cancel') || normalized.includes('no_show') || normalized.includes('out_of')
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : normalized.includes('clean') || normalized.includes('confirmed') || normalized.includes('resolved') || normalized.includes('inspected')
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : normalized.includes('dirty') || normalized.includes('pending') || normalized.includes('reported')
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-slate-200 bg-slate-50 text-slate-700';
  return <span className={`rounded-full border px-2 py-1 text-xs font-semibold capitalize ${tone}`}>{labelize(normalized)}</span>;
};

const roomTypeName = (roomTypes, roomTypeId) => (
  roomTypes.find((entry) => Number(entry.room_type_id) === Number(roomTypeId))?.name || `Room type #${roomTypeId}`
);

const reservationRooms = (reservation) => Array.isArray(reservation?.rooms) ? reservation.rooms : [];
const assignedRoomCount = (reservation) => reservationRooms(reservation).filter((room) => room.room_id).length;
const unassignedRoomCount = (reservation) => Math.max(0, (reservation.room_count || reservationRooms(reservation).length || 0) - assignedRoomCount(reservation));
const foliosForReservation = (folios, reservationId) => folios.filter((folio) => Number(folio.reservation_id) === Number(reservationId));
const openBalanceForReservation = (folios, reservationId) => foliosForReservation(folios, reservationId)
  .filter((folio) => folio.status === 'open')
  .reduce((sum, folio) => sum + Number(folio.balance || 0), 0);

export default function HospitalityPage() {
  const [activeTab, setActiveTab] = useState('today');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [guests, setGuests] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [stays, setStays] = useState([]);
  const [folios, setFolios] = useState([]);
  const [housekeepingTasks, setHousekeepingTasks] = useState([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [packages, setPackages] = useState([]);
  const [ratePlans, setRatePlans] = useState([]);
  const [reports, setReports] = useState(null);
  const [roomTypeForm, setRoomTypeForm] = useState({ code: '', name: '', base_occupancy: 1, max_occupancy: 2, default_rate: '', currency: 'PHP', amenities_snapshot: '' });
  const [roomForm, setRoomForm] = useState({ room_type_id: '', room_number: '', floor: '', building: '', status: 'vacant_dirty' });
  const [guestForm, setGuestForm] = useState({ name: '', email: '', phone: '' });
  const [reservationForm, setReservationForm] = useState({ customer_name: '', customer_email: '', customer_phone: '', room_type_id: '', room_id: '', auto_assign_rooms: false, check_in_date: today(), check_out_date: tomorrow(), adults: 1, children: 0, nightly_rate: '' });
  const [folioLineForm, setFolioLineForm] = useState({ folio_id: '', line_type: 'room_charge', description: '', quantity: 1, unit_price: '', total_amount: '' });
  const [housekeepingForm, setHousekeepingForm] = useState({ room_id: '', task_type: 'turnover', status: 'pending', priority: 'normal', notes: '' });
  const [maintenanceForm, setMaintenanceForm] = useState({ room_id: '', facility_id: '', issue_type: '', priority: 'normal', description: '', out_of_order: false });
  const [amenityForm, setAmenityForm] = useState({ name: '', amenity_type: 'property', description: '', price: '', is_paid: false });
  const [amenityLinkForm, setAmenityLinkForm] = useState({ amenity_id: '', link_scope: 'property', room_type_id: '', room_id: '' });
  const [facilityForm, setFacilityForm] = useState({ name: '', facility_type: 'pool', capacity: 1, price: '', is_bookable: false });
  const [facilityBookingForm, setFacilityBookingForm] = useState({ facility_id: '', reservation_id: '', start_at: '', end_at: '', party_size: 1, total_amount: '' });
  const [packageForm, setPackageForm] = useState({ code: '', name: '', package_type: 'accommodation', price_delta: '', description: '' });
  const [packageItemForm, setPackageItemForm] = useState({ package_id: '', amenity_id: '', facility_id: '', quantity: 1, pricing_mode: 'included' });
  const [guestMessageForm, setGuestMessageForm] = useState({ guest_profile_id: '', reservation_id: '', subject: '', body: '' });
  const [ratePlanForm, setRatePlanForm] = useState({ code: '', name: '', cancellation_policy: '', deposit_policy_text: '' });

  const loadHospitalityWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const [
        dashboardData,
        roomTypeData,
        roomData,
        guestData,
        reservationData,
        stayData,
        folioData,
        housekeepingData,
        maintenanceData,
        amenityData,
        facilityData,
        packageData,
        ratePlanData,
        reportData
      ] = await Promise.all([
        getHospitalityDashboard(),
        listHospitalityRoomTypes({ limit: 500 }),
        listHospitalityRooms({ limit: 800 }),
        listHospitalityGuests({ limit: 300 }),
        listHospitalityReservations({ limit: 300 }),
        listHospitalityStays({ limit: 200 }),
        listHospitalityFolios({ limit: 200 }),
        listHospitalityHousekeepingTasks({ limit: 300 }),
        listHospitalityMaintenanceRequests({ limit: 300 }),
        listHospitalityAmenities(),
        listHospitalityFacilities(),
        listHospitalityPackages(),
        listHospitalityRatePlans(),
        getHospitalityReports().catch(() => null)
      ]);
      setDashboard(dashboardData || null);
      setRoomTypes(toArray(roomTypeData, ['room_types']));
      setRooms(toArray(roomData, ['rooms']));
      setGuests(toArray(guestData, ['guests']));
      setReservations(toArray(reservationData, ['reservations']));
      setStays(toArray(stayData, ['stays']));
      setFolios(toArray(folioData, ['folios']));
      setHousekeepingTasks(toArray(housekeepingData, ['tasks', 'housekeeping_tasks']));
      setMaintenanceRequests(toArray(maintenanceData, ['requests', 'maintenance_requests']));
      setAmenities(toArray(amenityData, ['amenities']));
      setFacilities(toArray(facilityData, ['facilities']));
      setPackages(toArray(packageData, ['packages']));
      setRatePlans(toArray(ratePlanData, ['rate_plans', 'rates']));
      setReports(reportData || null);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to load Hospitality workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHospitalityWorkspace();
  }, [loadHospitalityWorkspace]);

  const arrivalsToday = useMemo(() => reservations.filter((entry) => entry.check_in_date === today()), [reservations]);
  const departuresToday = useMemo(() => reservations.filter((entry) => entry.check_out_date === today()), [reservations]);
  const activeReservations = useMemo(() => reservations.filter((entry) => ['confirmed', 'checked_in', 'in_house'].includes(entry.status)), [reservations]);
  const roomStatusCounts = dashboard?.rooms_by_status || rooms.reduce((acc, room) => ({ ...acc, [room.status]: (acc[room.status] || 0) + 1 }), {});

  const submitWithRefresh = async (key, action, successMessage) => {
    setSaving(key);
    try {
      await action();
      await loadHospitalityWorkspace();
      toast.success(successMessage);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to save Hospitality changes.');
    } finally {
      setSaving('');
    }
  };

  const createRoomType = (event) => {
    event.preventDefault();
    submitWithRefresh('room-type', async () => {
      await createHospitalityRoomType({
        ...roomTypeForm,
        base_occupancy: Number(roomTypeForm.base_occupancy || 1),
        max_occupancy: Number(roomTypeForm.max_occupancy || 1),
        default_rate: Number(roomTypeForm.default_rate || 0),
        amenities_snapshot: roomTypeForm.amenities_snapshot.split(',').map((entry) => entry.trim()).filter(Boolean)
      });
      setRoomTypeForm({ code: '', name: '', base_occupancy: 1, max_occupancy: 2, default_rate: '', currency: 'PHP', amenities_snapshot: '' });
    }, 'Room type created.');
  };

  const createRoomRecord = (event) => {
    event.preventDefault();
    submitWithRefresh('room', async () => {
      await createHospitalityRoom({ ...roomForm, room_type_id: Number(roomForm.room_type_id) });
      setRoomForm({ room_type_id: '', room_number: '', floor: '', building: '', status: 'vacant_dirty' });
    }, 'Room created.');
  };

  const createGuest = (event) => {
    event.preventDefault();
    submitWithRefresh('guest', async () => {
      await createHospitalityGuest(guestForm);
      setGuestForm({ name: '', email: '', phone: '' });
    }, 'Guest profile created.');
  };

  const createReservation = (event) => {
    event.preventDefault();
    submitWithRefresh('reservation', async () => {
      await createHospitalityReservation({
        ...reservationForm,
        room_type_id: Number(reservationForm.room_type_id),
        room_id: reservationForm.room_id ? Number(reservationForm.room_id) : null,
        auto_assign_rooms: reservationForm.auto_assign_rooms === true,
        adults: Number(reservationForm.adults || 1),
        children: Number(reservationForm.children || 0),
        nightly_rate: Number(reservationForm.nightly_rate || 0)
      });
      setReservationForm((prev) => ({ ...prev, customer_name: '', customer_email: '', customer_phone: '', room_id: '', auto_assign_rooms: false }));
    }, 'Reservation created.');
  };

  const createFolioForReservation = (reservationId) => submitWithRefresh(`folio-${reservationId}`, async () => {
    await createHospitalityFolio({ reservation_id: reservationId, status: 'open' });
  }, 'Folio opened.');

  const addFolioLine = (event) => {
    event.preventDefault();
    submitWithRefresh('folio-line', async () => {
      await addHospitalityFolioLine(folioLineForm.folio_id, {
        line_type: folioLineForm.line_type,
        description: folioLineForm.description,
        quantity: Number(folioLineForm.quantity || 1),
        unit_amount: Number(folioLineForm.unit_price || 0),
        total_amount: Number(folioLineForm.total_amount || folioLineForm.unit_price || 0)
      });
      setFolioLineForm({ folio_id: '', line_type: 'room_charge', description: '', quantity: 1, unit_price: '', total_amount: '' });
    }, 'Folio line posted.');
  };

  const createHousekeepingTask = (event) => {
    event.preventDefault();
    submitWithRefresh('housekeeping', async () => {
      await createHospitalityHousekeepingTask({ ...housekeepingForm, room_id: Number(housekeepingForm.room_id) });
      setHousekeepingForm({ room_id: '', task_type: 'turnover', status: 'pending', priority: 'normal', notes: '' });
    }, 'Housekeeping task created.');
  };

  const createMaintenanceRequest = (event) => {
    event.preventDefault();
    submitWithRefresh('maintenance', async () => {
      await createHospitalityMaintenanceRequest({
        ...maintenanceForm,
        room_id: maintenanceForm.room_id ? Number(maintenanceForm.room_id) : null,
        facility_id: maintenanceForm.facility_id ? Number(maintenanceForm.facility_id) : null,
        out_of_order: maintenanceForm.out_of_order === true
      });
      setMaintenanceForm({ room_id: '', facility_id: '', issue_type: '', priority: 'normal', description: '', out_of_order: false });
    }, 'Maintenance request created.');
  };

  const createAmenity = (event) => {
    event.preventDefault();
    submitWithRefresh('amenity', async () => {
      await createHospitalityAmenity({ ...amenityForm, price: Number(amenityForm.price || 0), is_paid: amenityForm.is_paid === true });
      setAmenityForm({ name: '', amenity_type: 'property', description: '', price: '', is_paid: false });
    }, 'Amenity created.');
  };

  const createFacility = (event) => {
    event.preventDefault();
    submitWithRefresh('facility', async () => {
      await createHospitalityFacility({ ...facilityForm, capacity: Number(facilityForm.capacity || 1), price: Number(facilityForm.price || 0), is_bookable: facilityForm.is_bookable === true });
      setFacilityForm({ name: '', facility_type: 'pool', capacity: 1, price: '', is_bookable: false });
    }, 'Facility created.');
  };

  const linkAmenity = (event) => {
    event.preventDefault();
    submitWithRefresh('amenity-link', async () => {
      const payload = {
        amenity_id: Number(amenityLinkForm.amenity_id),
        included: true
      };
      if (amenityLinkForm.link_scope === 'property') {
        await createHospitalityPropertyAmenity(payload);
      } else {
        await createHospitalityRoomAmenity({
          ...payload,
          room_type_id: amenityLinkForm.link_scope === 'room_type' ? Number(amenityLinkForm.room_type_id) : null,
          room_id: amenityLinkForm.link_scope === 'room' ? Number(amenityLinkForm.room_id) : null
        });
      }
      setAmenityLinkForm({ amenity_id: '', link_scope: 'property', room_type_id: '', room_id: '' });
    }, 'Amenity linked.');
  };

  const createFacilityBooking = (event) => {
    event.preventDefault();
    submitWithRefresh('facility-booking', async () => {
      await createHospitalityFacilityBooking({
        ...facilityBookingForm,
        facility_id: Number(facilityBookingForm.facility_id),
        reservation_id: facilityBookingForm.reservation_id ? Number(facilityBookingForm.reservation_id) : null,
        party_size: Number(facilityBookingForm.party_size || 1),
        total_amount: Number(facilityBookingForm.total_amount || 0)
      });
      setFacilityBookingForm({ facility_id: '', reservation_id: '', start_at: '', end_at: '', party_size: 1, total_amount: '' });
    }, 'Facility booking created.');
  };

  const createPackage = (event) => {
    event.preventDefault();
    submitWithRefresh('package', async () => {
      await createHospitalityPackage({ ...packageForm, price_delta: Number(packageForm.price_delta || 0) });
      setPackageForm({ code: '', name: '', package_type: 'accommodation', price_delta: '', description: '' });
    }, 'Package created.');
  };

  const linkPackageItem = (event) => {
    event.preventDefault();
    submitWithRefresh('package-item', async () => {
      await createHospitalityPackageItem({
        package_id: Number(packageItemForm.package_id),
        amenity_id: packageItemForm.amenity_id ? Number(packageItemForm.amenity_id) : null,
        facility_id: packageItemForm.facility_id ? Number(packageItemForm.facility_id) : null,
        quantity: Number(packageItemForm.quantity || 1),
        pricing_mode: packageItemForm.pricing_mode
      });
      setPackageItemForm({ package_id: '', amenity_id: '', facility_id: '', quantity: 1, pricing_mode: 'included' });
    }, 'Package item linked.');
  };

  const createGuestMessage = (event) => {
    event.preventDefault();
    submitWithRefresh('guest-message', async () => {
      await createHospitalityGuestMessage({
        ...guestMessageForm,
        guest_profile_id: guestMessageForm.guest_profile_id ? Number(guestMessageForm.guest_profile_id) : null,
        reservation_id: guestMessageForm.reservation_id ? Number(guestMessageForm.reservation_id) : null,
        channel: 'internal',
        status: 'draft'
      });
      setGuestMessageForm({ guest_profile_id: '', reservation_id: '', subject: '', body: '' });
    }, 'Guest message saved.');
  };

  const createRatePlan = (event) => {
    event.preventDefault();
    submitWithRefresh('rate-plan', async () => {
      await createHospitalityRatePlan({
        code: ratePlanForm.code,
        name: ratePlanForm.name,
        cancellation_policy: ratePlanForm.cancellation_policy || null,
        deposit_policy: ratePlanForm.deposit_policy_text ? { note: ratePlanForm.deposit_policy_text } : null
      });
      setRatePlanForm({ code: '', name: '', cancellation_policy: '', deposit_policy_text: '' });
    }, 'Rate plan created.');
  };

  const updateReservationStatus = (reservation, status) => submitWithRefresh(`reservation-${reservation.reservation_id}`, async () => {
    await updateHospitalityReservationStatus(reservation.reservation_id, { status });
  }, 'Reservation updated.');

  const updateReservationStayDates = (reservation) => {
    const nextCheckIn = window.prompt('Check-in date', reservation.check_in_date);
    if (!nextCheckIn) return;
    const nextCheckOut = window.prompt('Check-out date', reservation.check_out_date);
    if (!nextCheckOut) return;
    submitWithRefresh(`reservation-dates-${reservation.reservation_id}`, async () => {
      await updateHospitalityReservationStatus(reservation.reservation_id, {
        status: reservation.status,
        check_in_date: nextCheckIn,
        check_out_date: nextCheckOut
      });
    }, 'Stay dates updated.');
  };

  const updateReservationRoom = (reservation, reservationRoom, roomId) => submitWithRefresh(`reservation-room-${reservationRoom.reservation_room_id}`, async () => {
    await updateHospitalityReservationRoom(reservation.reservation_id, reservationRoom.reservation_room_id, { room_id: Number(roomId) });
  }, 'Room assignment updated.');

  const overrideCheckout = (reservation) => submitWithRefresh(`checkout-${reservation.reservation_id}`, async () => {
    await updateHospitalityReservationStatus(reservation.reservation_id, { status: 'checked_out', override_open_balance: true });
  }, 'Reservation checked out with balance override.');

  const updateRoomStatus = (room, status) => submitWithRefresh(`room-${room.room_id}`, async () => {
    await updateHospitalityRoomStatus(room.room_id, { status });
  }, 'Room status updated.');

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Hospitality</h1>
          <p className="mt-1 text-sm text-slate-600">Reservations, rooms, guests, housekeeping, maintenance, amenities, folios, and rates.</p>
        </div>
        <button type="button" onClick={loadHospitalityWorkspace} className={buttonClass}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StatTile icon={CalendarDays} label="Arrivals" value={dashboard?.arrivals ?? arrivalsToday.length} hint="Due to check in today" />
        <StatTile icon={DoorOpen} label="Departures" value={dashboard?.departures ?? departuresToday.length} hint="Due to check out today" />
        <StatTile icon={Hotel} label="In House" value={dashboard?.in_house ?? stays.filter((entry) => entry.status === 'in_house').length} hint="Current occupied stays" />
        <StatTile icon={Hammer} label="Open Work" value={Number(dashboard?.housekeeping_open || 0) + Number(dashboard?.maintenance_open || 0)} hint={`${dashboard?.unassigned_arrivals || 0} unassigned arrival(s)`} />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${active ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading Hospitality workspace...</p>
      ) : (
        <>
          {activeTab === 'today' && (
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-lg font-semibold text-slate-950">Today Board</h2>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Arrivals</p>
                      <div className="mt-2 space-y-2">
                        {arrivalsToday.map((reservation) => (
                          <article key={reservation.reservation_id} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-900">{reservation.customer_name}</p>
                                <p className="text-xs text-slate-500">{reservation.public_reference} - {reservation.adults || 1} adult(s)</p>
                                {unassignedRoomCount(reservation) > 0 && <p className="mt-1 text-xs font-semibold text-amber-700">{unassignedRoomCount(reservation)} room(s) need assignment before check-in</p>}
                              </div>
                              <StatusBadge status={reservation.status} />
                            </div>
                          </article>
                        ))}
                        {arrivalsToday.length === 0 && <p className="text-sm text-slate-500">No arrivals today.</p>}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Departures</p>
                      <div className="mt-2 space-y-2">
                        {departuresToday.map((reservation) => (
                          <article key={reservation.reservation_id} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-900">{reservation.customer_name}</p>
                                <p className="text-xs text-slate-500">{reservation.public_reference} - {money(reservation.total_amount)}</p>
                              </div>
                              <StatusBadge status={reservation.status} />
                            </div>
                          </article>
                        ))}
                        {departuresToday.length === 0 && <p className="text-sm text-slate-500">No departures today.</p>}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-lg font-semibold text-slate-950">Room Status</h2>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {roomStatuses.map((status) => (
                      <div key={status} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{labelize(status)}</p>
                        <p className="mt-1 text-xl font-bold text-slate-950">{roomStatusCounts[status] || 0}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-lg font-semibold text-slate-950">Operational Queue</h2>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <span>Housekeeping open</span>
                      <strong>{dashboard?.housekeeping_open ?? housekeepingTasks.filter((entry) => !['inspected', 'blocked'].includes(entry.status)).length}</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                      <span>Maintenance open</span>
                      <strong>{dashboard?.maintenance_open ?? maintenanceRequests.filter((entry) => !['resolved', 'deferred'].includes(entry.status)).length}</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <span>Active reservations</span>
                      <strong>{activeReservations.length}</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                      <span>Unassigned arrivals</span>
                      <strong>{dashboard?.unassigned_arrivals ?? arrivalsToday.reduce((sum, reservation) => sum + unassignedRoomCount(reservation), 0)}</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                      <span>Out-of-order rooms</span>
                      <strong>{dashboard?.out_of_order_rooms ?? rooms.filter((room) => room.status === 'out_of_order').length}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'reservations' && (
            <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
              <form onSubmit={createReservation} className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-950">Create Reservation</h2>
                <div className="mt-3 grid gap-3">
                  <Field label="Guest Name"><input required value={reservationForm.customer_name} onChange={(event) => setReservationForm({ ...reservationForm, customer_name: event.target.value })} className={inputClass} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Email"><input type="email" value={reservationForm.customer_email} onChange={(event) => setReservationForm({ ...reservationForm, customer_email: event.target.value })} className={inputClass} /></Field>
                    <Field label="Phone"><input value={reservationForm.customer_phone} onChange={(event) => setReservationForm({ ...reservationForm, customer_phone: event.target.value })} className={inputClass} /></Field>
                  </div>
                  <Field label="Room Type">
                    <select required value={reservationForm.room_type_id} onChange={(event) => setReservationForm({ ...reservationForm, room_type_id: event.target.value })} className={inputClass}>
                      <option value="">Select room type</option>
                      {roomTypes.map((roomType) => <option key={roomType.room_type_id} value={roomType.room_type_id}>{roomType.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Assigned Room">
                    <select value={reservationForm.room_id} onChange={(event) => setReservationForm({ ...reservationForm, room_id: event.target.value, auto_assign_rooms: false })} className={inputClass}>
                      <option value="">Assign later</option>
                      {rooms.filter((room) => !reservationForm.room_type_id || Number(room.room_type_id) === Number(reservationForm.room_type_id)).map((room) => (
                        <option key={room.room_id} value={room.room_id}>{room.room_number} - {labelize(room.status)}</option>
                      ))}
                    </select>
                  </Field>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={reservationForm.auto_assign_rooms}
                      disabled={Boolean(reservationForm.room_id)}
                      onChange={(event) => setReservationForm({ ...reservationForm, auto_assign_rooms: event.target.checked })}
                    />
                    Auto-assign the best available room
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Check In"><input type="date" value={reservationForm.check_in_date} onChange={(event) => setReservationForm({ ...reservationForm, check_in_date: event.target.value })} className={inputClass} /></Field>
                    <Field label="Check Out"><input type="date" value={reservationForm.check_out_date} onChange={(event) => setReservationForm({ ...reservationForm, check_out_date: event.target.value })} className={inputClass} /></Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Adults"><input type="number" min="1" value={reservationForm.adults} onChange={(event) => setReservationForm({ ...reservationForm, adults: event.target.value })} className={inputClass} /></Field>
                    <Field label="Children"><input type="number" min="0" value={reservationForm.children} onChange={(event) => setReservationForm({ ...reservationForm, children: event.target.value })} className={inputClass} /></Field>
                    <Field label="Nightly Rate"><input type="number" min="0" step="0.01" value={reservationForm.nightly_rate} onChange={(event) => setReservationForm({ ...reservationForm, nightly_rate: event.target.value })} className={inputClass} /></Field>
                  </div>
                  <button type="submit" disabled={saving === 'reservation'} className={primaryButtonClass}>{saving === 'reservation' ? 'Saving...' : 'Create Reservation'}</button>
                </div>
              </form>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Reference</th>
                      <th className="px-3 py-2">Guest</th>
                      <th className="px-3 py-2">Stay</th>
                      <th className="px-3 py-2">Rooms</th>
                      <th className="px-3 py-2">Payment</th>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2">Total</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Folio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reservations.map((reservation) => (
                      <tr key={reservation.reservation_id} className="align-top">
                        <td className="px-3 py-3 font-semibold text-slate-900">{reservation.public_reference}</td>
                        <td className="px-3 py-3"><div className="font-medium text-slate-900">{reservation.customer_name}</div><div className="text-xs text-slate-500">{reservation.customer_email || reservation.customer_phone || 'No contact'}</div></td>
                        <td className="px-3 py-3 text-slate-700">{reservation.check_in_date} to {reservation.check_out_date}</td>
                        <td className="px-3 py-3 text-slate-700">
                          <div className="font-semibold">{assignedRoomCount(reservation)}/{reservation.room_count || reservationRooms(reservation).length || 1} assigned</div>
                          {unassignedRoomCount(reservation) > 0 && <div className="text-xs font-semibold text-amber-700">Assignment needed</div>}
                          <div className="mt-2 space-y-2">
                            {reservationRooms(reservation).map((reservationRoom) => (
                              <select
                                key={reservationRoom.reservation_room_id}
                                value={reservationRoom.room_id || ''}
                                onChange={(event) => event.target.value && updateReservationRoom(reservation, reservationRoom, event.target.value)}
                                className={inputClass}
                              >
                                <option value="">Assign room</option>
                                {rooms.filter((room) => Number(room.room_type_id) === Number(reservationRoom.room_type_id)).map((room) => (
                                  <option key={room.room_id} value={room.room_id}>Room {room.room_number} - {labelize(room.status)}</option>
                                ))}
                              </select>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          <StatusBadge status={reservation.payment_status || 'unpaid'} />
                          {openBalanceForReservation(folios, reservation.reservation_id) > 0 && <div className="mt-1 text-xs font-semibold text-rose-700">Open balance {money(openBalanceForReservation(folios, reservation.reservation_id))}</div>}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          <div className="font-semibold capitalize">{labelize(reservation.source || 'admin')}</div>
                          {reservation.store_customer_id && <div className="text-xs text-teal-700">Linked customer</div>}
                          {reservation.external_reference && <div className="text-xs text-slate-500">{reservation.external_source || 'channel'}: {reservation.external_reference}</div>}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-900">{money(reservation.total_amount)}</td>
                        <td className="px-3 py-3">
                          <select value={reservation.status} onChange={(event) => updateReservationStatus(reservation, event.target.value)} className={inputClass}>
                            {reservationStatuses.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
                          </select>
                          <button type="button" onClick={() => updateReservationStayDates(reservation)} className={`${buttonClass} mt-2 w-full`}>Edit Stay Dates</button>
                          {openBalanceForReservation(folios, reservation.reservation_id) > 0 && ['checked_in', 'in_house'].includes(reservation.status) && (
                            <button type="button" onClick={() => overrideCheckout(reservation)} className={`${buttonClass} mt-2 w-full text-rose-700`}>Override Checkout</button>
                          )}
                        </td>
                        <td className="px-3 py-3"><button type="button" onClick={() => createFolioForReservation(reservation.reservation_id)} className={buttonClass}>Open</button></td>
                      </tr>
                    ))}
                    {reservations.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-500">No reservations yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === 'rooms' && (
            <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
              <div className="space-y-4">
                <form onSubmit={createRoomType} className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-lg font-semibold text-slate-950">Room Type</h2>
                  <div className="mt-3 grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Code"><input required value={roomTypeForm.code} onChange={(event) => setRoomTypeForm({ ...roomTypeForm, code: event.target.value })} className={inputClass} /></Field>
                      <Field label="Name"><input required value={roomTypeForm.name} onChange={(event) => setRoomTypeForm({ ...roomTypeForm, name: event.target.value })} className={inputClass} /></Field>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Base Occ."><input type="number" min="1" value={roomTypeForm.base_occupancy} onChange={(event) => setRoomTypeForm({ ...roomTypeForm, base_occupancy: event.target.value })} className={inputClass} /></Field>
                      <Field label="Max Occ."><input type="number" min="1" value={roomTypeForm.max_occupancy} onChange={(event) => setRoomTypeForm({ ...roomTypeForm, max_occupancy: event.target.value })} className={inputClass} /></Field>
                      <Field label="Rate"><input type="number" min="0" step="0.01" value={roomTypeForm.default_rate} onChange={(event) => setRoomTypeForm({ ...roomTypeForm, default_rate: event.target.value })} className={inputClass} /></Field>
                    </div>
                    <Field label="Amenities"><input value={roomTypeForm.amenities_snapshot} onChange={(event) => setRoomTypeForm({ ...roomTypeForm, amenities_snapshot: event.target.value })} className={inputClass} placeholder="wifi, breakfast, pool access" /></Field>
                    <button type="submit" disabled={saving === 'room-type'} className={primaryButtonClass}>Create Room Type</button>
                  </div>
                </form>
                <form onSubmit={createRoomRecord} className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-lg font-semibold text-slate-950">Physical Room</h2>
                  <div className="mt-3 grid gap-3">
                    <Field label="Room Type">
                      <select required value={roomForm.room_type_id} onChange={(event) => setRoomForm({ ...roomForm, room_type_id: event.target.value })} className={inputClass}>
                        <option value="">Select room type</option>
                        {roomTypes.map((roomType) => <option key={roomType.room_type_id} value={roomType.room_type_id}>{roomType.name}</option>)}
                      </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Room Number"><input required value={roomForm.room_number} onChange={(event) => setRoomForm({ ...roomForm, room_number: event.target.value })} className={inputClass} /></Field>
                      <Field label="Floor"><input value={roomForm.floor} onChange={(event) => setRoomForm({ ...roomForm, floor: event.target.value })} className={inputClass} /></Field>
                    </div>
                    <Field label="Building"><input value={roomForm.building} onChange={(event) => setRoomForm({ ...roomForm, building: event.target.value })} className={inputClass} /></Field>
                    <button type="submit" disabled={saving === 'room'} className={buttonClass}>Create Room</button>
                  </div>
                </form>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rooms.map((room) => (
                  <article key={room.room_id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-950">Room {room.room_number}</h3>
                        <p className="text-sm text-slate-500">{room.roomType?.name || roomTypeName(roomTypes, room.room_type_id)}</p>
                      </div>
                      <StatusBadge status={room.status} />
                    </div>
                    <div className="mt-3 text-xs text-slate-500">{room.building || 'Main'} - Floor {room.floor || '-'}</div>
                    <select value={room.status} onChange={(event) => updateRoomStatus(room, event.target.value)} className={`${inputClass} mt-3`}>
                      {roomStatuses.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
                    </select>
                  </article>
                ))}
                {rooms.length === 0 && <p className="text-sm text-slate-500">No rooms yet.</p>}
              </div>
            </section>
          )}

          {activeTab === 'guests' && (
            <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <form onSubmit={createGuest} className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-950">Guest Profile</h2>
                <div className="mt-3 grid gap-3">
                  <Field label="Name"><input required value={guestForm.name} onChange={(event) => setGuestForm({ ...guestForm, name: event.target.value })} className={inputClass} /></Field>
                  <Field label="Email"><input type="email" value={guestForm.email} onChange={(event) => setGuestForm({ ...guestForm, email: event.target.value })} className={inputClass} /></Field>
                  <Field label="Phone"><input value={guestForm.phone} onChange={(event) => setGuestForm({ ...guestForm, phone: event.target.value })} className={inputClass} /></Field>
                  <button type="submit" disabled={saving === 'guest'} className={primaryButtonClass}>Create Guest</button>
                </div>
              </form>
              <form onSubmit={createGuestMessage} className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-950">Guest Message</h2>
                <div className="mt-3 grid gap-3">
                  <Field label="Guest"><select value={guestMessageForm.guest_profile_id} onChange={(event) => setGuestMessageForm({ ...guestMessageForm, guest_profile_id: event.target.value })} className={inputClass}><option value="">No linked guest</option>{guests.map((guest) => <option key={guest.guest_profile_id} value={guest.guest_profile_id}>{guest.name}</option>)}</select></Field>
                  <Field label="Reservation"><select value={guestMessageForm.reservation_id} onChange={(event) => setGuestMessageForm({ ...guestMessageForm, reservation_id: event.target.value })} className={inputClass}><option value="">No linked reservation</option>{reservations.map((reservation) => <option key={reservation.reservation_id} value={reservation.reservation_id}>{reservation.public_reference} - {reservation.customer_name}</option>)}</select></Field>
                  <Field label="Subject"><input value={guestMessageForm.subject} onChange={(event) => setGuestMessageForm({ ...guestMessageForm, subject: event.target.value })} className={inputClass} /></Field>
                  <Field label="Body"><textarea required value={guestMessageForm.body} onChange={(event) => setGuestMessageForm({ ...guestMessageForm, body: event.target.value })} className={textAreaClass} /></Field>
                  <button type="submit" disabled={saving === 'guest-message'} className={buttonClass}>Save Message</button>
                </div>
              </form>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {guests.map((guest) => (
                  <article key={guest.guest_profile_id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <h3 className="font-semibold text-slate-950">{guest.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{guest.email || guest.phone || 'No contact'}</p>
                    {guest.vip_status && <p className="mt-2 text-xs font-semibold uppercase text-teal-700">{guest.vip_status}</p>}
                  </article>
                ))}
                {guests.length === 0 && <p className="text-sm text-slate-500">No guest profiles yet.</p>}
              </div>
            </section>
          )}

          {activeTab === 'housekeeping' && (
            <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <form onSubmit={createHousekeepingTask} className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-950">Housekeeping Task</h2>
                <div className="mt-3 grid gap-3">
                  <Field label="Room"><select required value={housekeepingForm.room_id} onChange={(event) => setHousekeepingForm({ ...housekeepingForm, room_id: event.target.value })} className={inputClass}><option value="">Select room</option>{rooms.map((room) => <option key={room.room_id} value={room.room_id}>Room {room.room_number}</option>)}</select></Field>
                  <Field label="Task Type"><input value={housekeepingForm.task_type} onChange={(event) => setHousekeepingForm({ ...housekeepingForm, task_type: event.target.value })} className={inputClass} /></Field>
                  <Field label="Notes"><textarea value={housekeepingForm.notes} onChange={(event) => setHousekeepingForm({ ...housekeepingForm, notes: event.target.value })} className={textAreaClass} /></Field>
                  <button type="submit" disabled={saving === 'housekeeping'} className={primaryButtonClass}>Create Task</button>
                </div>
              </form>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {housekeepingTasks.map((task) => (
                  <article key={task.housekeeping_task_id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-950">{task.task_type || 'Housekeeping'}</h3>
                        <p className="text-sm text-slate-500">Room {task.room?.room_number || task.room_id}</p>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>
                    {task.notes && <p className="mt-3 text-sm text-slate-600">{task.notes}</p>}
                    <select value={task.status} onChange={(event) => submitWithRefresh(`hk-${task.housekeeping_task_id}`, () => updateHospitalityHousekeepingTask(task.housekeeping_task_id, { status: event.target.value }), 'Housekeeping updated.')} className={`${inputClass} mt-3`}>
                      {housekeepingStatuses.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
                    </select>
                  </article>
                ))}
                {housekeepingTasks.length === 0 && <p className="text-sm text-slate-500">No housekeeping tasks.</p>}
              </div>
            </section>
          )}

          {activeTab === 'maintenance' && (
            <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <form onSubmit={createMaintenanceRequest} className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-950">Maintenance Request</h2>
                <div className="mt-3 grid gap-3">
                  <Field label="Room"><select value={maintenanceForm.room_id} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, room_id: event.target.value })} className={inputClass}><option value="">No room</option>{rooms.map((room) => <option key={room.room_id} value={room.room_id}>Room {room.room_number}</option>)}</select></Field>
                  <Field label="Facility"><select value={maintenanceForm.facility_id} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, facility_id: event.target.value })} className={inputClass}><option value="">No facility</option>{facilities.map((facility) => <option key={facility.facility_id} value={facility.facility_id}>{facility.name}</option>)}</select></Field>
                  <Field label="Issue Type"><input value={maintenanceForm.issue_type} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, issue_type: event.target.value })} className={inputClass} /></Field>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={maintenanceForm.out_of_order} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, out_of_order: event.target.checked })} /> Block room from sale</label>
                  <Field label="Description"><textarea required value={maintenanceForm.description} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, description: event.target.value })} className={textAreaClass} /></Field>
                  <button type="submit" disabled={saving === 'maintenance'} className={primaryButtonClass}>Create Request</button>
                </div>
              </form>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {maintenanceRequests.map((request) => (
                  <article key={request.maintenance_request_id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-950">{request.issue_type || 'Maintenance'}</h3>
                        <p className="text-sm text-slate-500">{request.room?.room_number ? `Room ${request.room.room_number}` : request.facility?.name || 'Property'}</p>
                      </div>
                      <StatusBadge status={request.status} />
                    </div>
                    <p className="mt-3 text-sm text-slate-600">{request.description}</p>
                    <select value={request.status} onChange={(event) => submitWithRefresh(`mx-${request.maintenance_request_id}`, () => updateHospitalityMaintenanceRequest(request.maintenance_request_id, { status: event.target.value }), 'Maintenance updated.')} className={`${inputClass} mt-3`}>
                      {maintenanceStatuses.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
                    </select>
                  </article>
                ))}
                {maintenanceRequests.length === 0 && <p className="text-sm text-slate-500">No maintenance requests.</p>}
              </div>
            </section>
          )}

          {activeTab === 'folios' && (
            <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <form onSubmit={addFolioLine} className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-950">Post Folio Line</h2>
                <div className="mt-3 grid gap-3">
                  <Field label="Folio"><select required value={folioLineForm.folio_id} onChange={(event) => setFolioLineForm({ ...folioLineForm, folio_id: event.target.value })} className={inputClass}><option value="">Select folio</option>{folios.map((folio) => <option key={folio.folio_id} value={folio.folio_id}>Folio #{folio.folio_id} - {folio.status}</option>)}</select></Field>
                  <Field label="Line Type"><select value={folioLineForm.line_type} onChange={(event) => setFolioLineForm({ ...folioLineForm, line_type: event.target.value })} className={inputClass}>{['room_charge', 'tax', 'fee', 'deposit', 'payment', 'refund', 'amenity', 'minibar', 'retail', 'room_service', 'adjustment'].map((entry) => <option key={entry} value={entry}>{labelize(entry)}</option>)}</select></Field>
                  <Field label="Description"><input required value={folioLineForm.description} onChange={(event) => setFolioLineForm({ ...folioLineForm, description: event.target.value })} className={inputClass} /></Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Qty"><input type="number" min="1" value={folioLineForm.quantity} onChange={(event) => setFolioLineForm({ ...folioLineForm, quantity: event.target.value })} className={inputClass} /></Field>
                    <Field label="Unit Price"><input type="number" step="0.01" value={folioLineForm.unit_price} onChange={(event) => setFolioLineForm({ ...folioLineForm, unit_price: event.target.value })} className={inputClass} /></Field>
                    <Field label="Total"><input type="number" step="0.01" value={folioLineForm.total_amount} onChange={(event) => setFolioLineForm({ ...folioLineForm, total_amount: event.target.value })} className={inputClass} /></Field>
                  </div>
                  <button type="submit" disabled={saving === 'folio-line'} className={primaryButtonClass}>Post Line</button>
                </div>
              </form>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {folios.map((folio) => (
                  <article key={folio.folio_id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-slate-950">Folio #{folio.folio_id}</h3>
                      <StatusBadge status={folio.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                      <span>Charges {money(folio.total_charges)}</span>
                      <span>Payments {money(folio.total_payments)}</span>
                      <span>Balance {money(folio.balance)}</span>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-slate-500">
                      {(folio.lines || []).slice(0, 4).map((line) => <p key={line.folio_line_id}>{labelize(line.line_type)} - {line.description} - {money(line.total_amount)}</p>)}
                    </div>
                  </article>
                ))}
                {folios.length === 0 && <p className="text-sm text-slate-500">No folios yet. Open one from a reservation.</p>}
              </div>
            </section>
          )}

          {activeTab === 'amenities' && (
            <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
              <div className="space-y-4">
                <form onSubmit={createAmenity} className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-lg font-semibold text-slate-950">Amenity</h2>
                  <div className="mt-3 grid gap-3">
                    <Field label="Name"><input required value={amenityForm.name} onChange={(event) => setAmenityForm({ ...amenityForm, name: event.target.value })} className={inputClass} /></Field>
                    <Field label="Type"><select value={amenityForm.amenity_type} onChange={(event) => setAmenityForm({ ...amenityForm, amenity_type: event.target.value })} className={inputClass}>{amenityTypes.map((entry) => <option key={entry} value={entry}>{labelize(entry)}</option>)}</select></Field>
                    <Field label="Description"><textarea value={amenityForm.description} onChange={(event) => setAmenityForm({ ...amenityForm, description: event.target.value })} className={textAreaClass} /></Field>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={amenityForm.is_paid} onChange={(event) => setAmenityForm({ ...amenityForm, is_paid: event.target.checked })} /> Paid add-on</label>
                    <Field label="Price"><input type="number" min="0" step="0.01" value={amenityForm.price} onChange={(event) => setAmenityForm({ ...amenityForm, price: event.target.value })} className={inputClass} /></Field>
                    <button type="submit" disabled={saving === 'amenity'} className={primaryButtonClass}>Create Amenity</button>
                  </div>
                </form>
                <form onSubmit={createFacility} className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-lg font-semibold text-slate-950">Facility</h2>
                  <div className="mt-3 grid gap-3">
                    <Field label="Name"><input required value={facilityForm.name} onChange={(event) => setFacilityForm({ ...facilityForm, name: event.target.value })} className={inputClass} /></Field>
                    <Field label="Type"><select value={facilityForm.facility_type} onChange={(event) => setFacilityForm({ ...facilityForm, facility_type: event.target.value })} className={inputClass}>{['meeting_room', 'pool', 'gym', 'spa', 'parking', 'shuttle', 'business_center', 'laundry', 'other'].map((entry) => <option key={entry} value={entry}>{labelize(entry)}</option>)}</select></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Capacity"><input type="number" min="1" value={facilityForm.capacity} onChange={(event) => setFacilityForm({ ...facilityForm, capacity: event.target.value })} className={inputClass} /></Field>
                      <Field label="Price"><input type="number" min="0" step="0.01" value={facilityForm.price} onChange={(event) => setFacilityForm({ ...facilityForm, price: event.target.value })} className={inputClass} /></Field>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={facilityForm.is_bookable} onChange={(event) => setFacilityForm({ ...facilityForm, is_bookable: event.target.checked })} /> Bookable</label>
                    <button type="submit" disabled={saving === 'facility'} className={buttonClass}>Create Facility</button>
                  </div>
                </form>
                <form onSubmit={linkAmenity} className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-lg font-semibold text-slate-950">Amenity Link</h2>
                  <div className="mt-3 grid gap-3">
                    <Field label="Amenity"><select required value={amenityLinkForm.amenity_id} onChange={(event) => setAmenityLinkForm({ ...amenityLinkForm, amenity_id: event.target.value })} className={inputClass}><option value="">Select amenity</option>{amenities.map((amenity) => <option key={amenity.amenity_id} value={amenity.amenity_id}>{amenity.name}</option>)}</select></Field>
                    <Field label="Scope"><select value={amenityLinkForm.link_scope} onChange={(event) => setAmenityLinkForm({ ...amenityLinkForm, link_scope: event.target.value })} className={inputClass}><option value="property">Property</option><option value="room_type">Room type</option><option value="room">Room</option></select></Field>
                    {amenityLinkForm.link_scope === 'room_type' && <Field label="Room Type"><select required value={amenityLinkForm.room_type_id} onChange={(event) => setAmenityLinkForm({ ...amenityLinkForm, room_type_id: event.target.value })} className={inputClass}><option value="">Select room type</option>{roomTypes.map((roomType) => <option key={roomType.room_type_id} value={roomType.room_type_id}>{roomType.name}</option>)}</select></Field>}
                    {amenityLinkForm.link_scope === 'room' && <Field label="Room"><select required value={amenityLinkForm.room_id} onChange={(event) => setAmenityLinkForm({ ...amenityLinkForm, room_id: event.target.value })} className={inputClass}><option value="">Select room</option>{rooms.map((room) => <option key={room.room_id} value={room.room_id}>Room {room.room_number}</option>)}</select></Field>}
                    <button type="submit" disabled={saving === 'amenity-link'} className={buttonClass}>Link Amenity</button>
                  </div>
                </form>
                <form onSubmit={createFacilityBooking} className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-lg font-semibold text-slate-950">Facility Booking</h2>
                  <div className="mt-3 grid gap-3">
                    <Field label="Facility"><select required value={facilityBookingForm.facility_id} onChange={(event) => setFacilityBookingForm({ ...facilityBookingForm, facility_id: event.target.value })} className={inputClass}><option value="">Select facility</option>{facilities.map((facility) => <option key={facility.facility_id} value={facility.facility_id}>{facility.name}</option>)}</select></Field>
                    <Field label="Reservation"><select value={facilityBookingForm.reservation_id} onChange={(event) => setFacilityBookingForm({ ...facilityBookingForm, reservation_id: event.target.value })} className={inputClass}><option value="">No linked reservation</option>{reservations.map((reservation) => <option key={reservation.reservation_id} value={reservation.reservation_id}>{reservation.public_reference}</option>)}</select></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Start"><input type="datetime-local" required value={facilityBookingForm.start_at} onChange={(event) => setFacilityBookingForm({ ...facilityBookingForm, start_at: event.target.value })} className={inputClass} /></Field>
                      <Field label="End"><input type="datetime-local" required value={facilityBookingForm.end_at} onChange={(event) => setFacilityBookingForm({ ...facilityBookingForm, end_at: event.target.value })} className={inputClass} /></Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Party Size"><input type="number" min="1" value={facilityBookingForm.party_size} onChange={(event) => setFacilityBookingForm({ ...facilityBookingForm, party_size: event.target.value })} className={inputClass} /></Field>
                      <Field label="Amount"><input type="number" min="0" step="0.01" value={facilityBookingForm.total_amount} onChange={(event) => setFacilityBookingForm({ ...facilityBookingForm, total_amount: event.target.value })} className={inputClass} /></Field>
                    </div>
                    <button type="submit" disabled={saving === 'facility-booking'} className={buttonClass}>Book Facility</button>
                  </div>
                </form>
              </div>
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {amenities.map((amenity) => (
                    <article key={amenity.amenity_id} className="rounded-lg border border-slate-200 bg-white p-4">
                      <h3 className="font-semibold text-slate-950">{amenity.name}</h3>
                      <p className="mt-1 text-xs font-semibold uppercase text-teal-700">{labelize(amenity.amenity_type)}</p>
                      <p className="mt-2 text-sm text-slate-600">{amenity.description || 'No description'}</p>
                      {amenity.is_paid && <p className="mt-2 text-sm font-semibold text-slate-900">{money(amenity.price)}</p>}
                    </article>
                  ))}
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {facilities.map((facility) => (
                    <article key={facility.facility_id} className="rounded-lg border border-slate-200 bg-white p-4">
                      <h3 className="font-semibold text-slate-950">{facility.name}</h3>
                      <p className="mt-1 text-sm text-slate-500">{labelize(facility.facility_type)} - cap {facility.capacity}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{facility.is_bookable ? money(facility.price) : 'Included / non-bookable'}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeTab === 'rates' && (
            <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-4">
                <form onSubmit={createRatePlan} className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-lg font-semibold text-slate-950">Rate Plan</h2>
                  <div className="mt-3 grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Code"><input required value={ratePlanForm.code} onChange={(event) => setRatePlanForm({ ...ratePlanForm, code: event.target.value })} className={inputClass} /></Field>
                      <Field label="Name"><input required value={ratePlanForm.name} onChange={(event) => setRatePlanForm({ ...ratePlanForm, name: event.target.value })} className={inputClass} /></Field>
                    </div>
                    <Field label="Cancellation Policy"><textarea value={ratePlanForm.cancellation_policy} onChange={(event) => setRatePlanForm({ ...ratePlanForm, cancellation_policy: event.target.value })} className={textAreaClass} /></Field>
                    <Field label="Deposit Policy"><textarea value={ratePlanForm.deposit_policy_text} onChange={(event) => setRatePlanForm({ ...ratePlanForm, deposit_policy_text: event.target.value })} className={textAreaClass} /></Field>
                    <button type="submit" disabled={saving === 'rate-plan'} className={primaryButtonClass}>Create Rate Plan</button>
                  </div>
                </form>
                <form onSubmit={createPackage} className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-lg font-semibold text-slate-950">Package</h2>
                  <div className="mt-3 grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Code"><input required value={packageForm.code} onChange={(event) => setPackageForm({ ...packageForm, code: event.target.value })} className={inputClass} /></Field>
                      <Field label="Name"><input required value={packageForm.name} onChange={(event) => setPackageForm({ ...packageForm, name: event.target.value })} className={inputClass} /></Field>
                    </div>
                    <Field label="Type"><select value={packageForm.package_type} onChange={(event) => setPackageForm({ ...packageForm, package_type: event.target.value })} className={inputClass}>{['accommodation', 'amenity', 'meal', 'facility', 'promo'].map((entry) => <option key={entry} value={entry}>{labelize(entry)}</option>)}</select></Field>
                    <Field label="Price Delta"><input type="number" step="0.01" value={packageForm.price_delta} onChange={(event) => setPackageForm({ ...packageForm, price_delta: event.target.value })} className={inputClass} /></Field>
                    <Field label="Description"><textarea value={packageForm.description} onChange={(event) => setPackageForm({ ...packageForm, description: event.target.value })} className={textAreaClass} /></Field>
                    <button type="submit" disabled={saving === 'package'} className={buttonClass}>Create Package</button>
                  </div>
                </form>
                <form onSubmit={linkPackageItem} className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-lg font-semibold text-slate-950">Package Item</h2>
                  <div className="mt-3 grid gap-3">
                    <Field label="Package"><select required value={packageItemForm.package_id} onChange={(event) => setPackageItemForm({ ...packageItemForm, package_id: event.target.value })} className={inputClass}><option value="">Select package</option>{packages.map((entry) => <option key={entry.package_id} value={entry.package_id}>{entry.name}</option>)}</select></Field>
                    <Field label="Amenity"><select value={packageItemForm.amenity_id} onChange={(event) => setPackageItemForm({ ...packageItemForm, amenity_id: event.target.value })} className={inputClass}><option value="">No amenity</option>{amenities.map((amenity) => <option key={amenity.amenity_id} value={amenity.amenity_id}>{amenity.name}</option>)}</select></Field>
                    <Field label="Facility"><select value={packageItemForm.facility_id} onChange={(event) => setPackageItemForm({ ...packageItemForm, facility_id: event.target.value })} className={inputClass}><option value="">No facility</option>{facilities.map((facility) => <option key={facility.facility_id} value={facility.facility_id}>{facility.name}</option>)}</select></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Qty"><input type="number" min="1" value={packageItemForm.quantity} onChange={(event) => setPackageItemForm({ ...packageItemForm, quantity: event.target.value })} className={inputClass} /></Field>
                      <Field label="Pricing"><select value={packageItemForm.pricing_mode} onChange={(event) => setPackageItemForm({ ...packageItemForm, pricing_mode: event.target.value })} className={inputClass}>{['included', 'per_stay', 'per_night', 'per_guest'].map((entry) => <option key={entry} value={entry}>{labelize(entry)}</option>)}</select></Field>
                    </div>
                    <button type="submit" disabled={saving === 'package-item'} className={buttonClass}>Link Package Item</button>
                  </div>
                </form>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {ratePlans.map((ratePlan) => (
                  <article key={ratePlan.rate_plan_id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <h3 className="font-semibold text-slate-950">{ratePlan.name}</h3>
                    <p className="mt-1 text-xs font-semibold uppercase text-teal-700">{ratePlan.code}</p>
                    <p className="mt-2 text-sm text-slate-600">{ratePlan.cancellation_policy || 'No cancellation policy saved'}</p>
                  </article>
                ))}
                {packages.map((entry) => (
                  <article key={`package-${entry.package_id}`} className="rounded-lg border border-slate-200 bg-white p-4">
                    <h3 className="font-semibold text-slate-950">{entry.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{labelize(entry.package_type)} - {money(entry.price_delta)}</p>
                    <p className="mt-2 text-sm text-slate-600">{entry.description || 'No description'}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'reports' && (
            <section className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <StatTile icon={DoorOpen} label="Occupied/In House" value={dashboard?.in_house ?? 0} hint="Current stay pressure" />
                <StatTile icon={ClipboardCheck} label="Housekeeping Open" value={dashboard?.housekeeping_open ?? 0} hint="Rooms not ready" />
                <StatTile icon={Hammer} label="Maintenance Open" value={dashboard?.maintenance_open ?? 0} hint="Reported unresolved work" />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <StatTile icon={Hotel} label="Occupancy" value={`${Number(dashboard?.occupancy_percent || 0).toFixed(1)}%`} hint={`${dashboard?.room_count || rooms.length} active room(s)`} />
                <StatTile icon={CreditCard} label="ADR" value={money(dashboard?.adr)} hint="Active reservation revenue per room" />
                <StatTile icon={Percent} label="RevPAR" value={money(dashboard?.revpar)} hint="Active revenue per room inventory" />
                <StatTile icon={BedDouble} label="Unassigned" value={dashboard?.unassigned_arrivals ?? 0} hint="Arrivals needing room assignment" />
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-950">Operational Metrics</h2>
                <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <div className="rounded-md bg-slate-50 p-3">Out-of-order rooms: <strong>{dashboard?.out_of_order_rooms ?? 0}</strong></div>
                  <div className="rounded-md bg-slate-50 p-3">Departures today: <strong>{dashboard?.departures ?? departuresToday.length}</strong></div>
                  <div className="rounded-md bg-slate-50 p-3">Arrivals today: <strong>{dashboard?.arrivals ?? arrivalsToday.length}</strong></div>
                  <div className="rounded-md bg-slate-50 p-3">Open operational work: <strong>{Number(dashboard?.housekeeping_open || 0) + Number(dashboard?.maintenance_open || 0)}</strong></div>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-600">Raw metric payload</summary>
                  <pre className="mt-3 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(reports?.metrics || dashboard || {}, null, 2)}</pre>
                </details>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
