Name:           simplehost-panel
Version:        %{version}
Release:        1%{?dist}
Summary:        SimpleHost Panel release bundle
License:        Proprietary
BuildArch:      noarch
Source0:        %{name}-%{version}.tar.gz

Requires:       nodejs
Requires(post): systemd
Requires(postun): systemd

%description
Prebuilt SimpleHost Panel release bundle for installation under /opt/simplehost/spanel.

%prep
%setup -q -n %{name}-%{version}

%build
# Release bundle is prebuilt.

%install
mkdir -p %{buildroot}/opt/simplehost/spanel/releases/%{version}
cp -a . %{buildroot}/opt/simplehost/spanel/releases/%{version}
mkdir -p %{buildroot}/etc/systemd/system
cp packaging/systemd/spanel-api.service %{buildroot}/etc/systemd/system/
cp packaging/systemd/spanel-web.service %{buildroot}/etc/systemd/system/
cp packaging/systemd/spanel-worker.service %{buildroot}/etc/systemd/system/
mkdir -p %{buildroot}/etc/spanel
cp packaging/env/spanel-api.env.example %{buildroot}/etc/spanel/
cp packaging/env/spanel-web.env.example %{buildroot}/etc/spanel/
cp packaging/env/spanel-worker.env.example %{buildroot}/etc/spanel/

%post
ln -sfn /opt/simplehost/spanel/releases/%{version} /opt/simplehost/spanel/current
%systemd_post spanel-api.service
%systemd_post spanel-web.service
%systemd_post spanel-worker.service

%postun
%systemd_postun_with_restart spanel-api.service
%systemd_postun_with_restart spanel-web.service
%systemd_postun_with_restart spanel-worker.service

%files
/opt/simplehost/spanel/releases/%{version}
/etc/systemd/system/spanel-api.service
/etc/systemd/system/spanel-web.service
/etc/systemd/system/spanel-worker.service
/etc/spanel/spanel-api.env.example
/etc/spanel/spanel-web.env.example
/etc/spanel/spanel-worker.env.example
