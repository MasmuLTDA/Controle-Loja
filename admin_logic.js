// admin_logic.js - Lógica para o Painel Administrativo (Corrigido)
// Ajustado para ler de /attendances e /clientData
// Extrai informações de atendentes dos próprios atendimentos

document.addEventListener("DOMContentLoaded", () => {
    // --- Configuração e Inicialização do Firebase ---
    const firebaseConfig = {
        apiKey: "AIzaSyBP7vj2eett5t49PlWRxfGXOOYehkNibik", // Use a API Key correta
        authDomain: "controle-loja-9c606.firebaseapp.com",
        projectId: "controle-loja-9c606",
        storageBucket: "controle-loja-9c606.firebasestorage.app",
        messagingSenderId: "291893265962",
        appId: "1:291893265962:web:3d2405ada394060f40a553",
        databaseURL: "https://controle-loja-9c606-default-rtdb.firebaseio.com"
    };

    // Inicializar Firebase
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();
    // CORREÇÃO: Usar os paths corretos do Firebase
    const attendancesRef = database.ref("attendances");
    const clientDataRef = database.ref("clientData");
    // REMOÇÃO: Não há um nó /atendentes separado
    // const atendentesRef = database.ref("atendentes");

    // --- Variáveis Globais e Caches ---
    let allAttendances = [];
    let clientesCache = {};
    let atendentesCache = {}; // Será populado a partir dos atendimentos
    let currentEditingAttendanceId = null;
    let isLoading = true; // Flag para indicar carregamento inicial

    // --- Funções Auxiliares ---
    function formatCurrency(value) {
        if (typeof value !== 'number') {
            value = parseFloat(value) || 0;
        }
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function getChannelBadge(channel) {
        if (!channel) return "-";
        const lowerChannel = channel.toLowerCase();
        if (lowerChannel.includes('whatsapp')) {
            return '<span class="channel-badge channel-whatsapp">WhatsApp</span>';
        } else if (lowerChannel.includes('instagram')) {
            return '<span class="channel-badge channel-instagram">Instagram</span>';
        } else if (lowerChannel.includes('presencial')) {
            return '<span class="channel-badge channel-presencial">Presencial</span>';
        } else {
            return channel; // Retorna o nome original se não reconhecido
        }
    }

    function formatTimestamp(timestamp) {
        if (!timestamp) return "-";
        try {
            const dateObj = new Date(timestamp);
            if (isNaN(dateObj)) return "Data inválida";
            return dateObj.toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {
            console.error("Erro ao formatar timestamp:", timestamp, e);
            return "Erro data";
        }
    }

    function getNumericTimestamp(timestamp) {
        if (!timestamp) return 0;
        try {
            const dateObj = new Date(timestamp);
            return isNaN(dateObj) ? 0 : dateObj.getTime();
        } catch (e) {
            return 0;
        }
    }

    // --- Funções de Carregamento de Dados (Firebase) ---

    async function loadInitialData() {
        isLoading = true;
        showLoadingIndicators(); // Mostra "Carregando..." nas tabelas
        try {
            // CORREÇÃO: Carregar apenas clientData inicialmente
            const clientesSnapshot = await clientDataRef.once("value");
            clientesCache = clientesSnapshot.val() || {};
            console.log("Clientes carregados:", Object.keys(clientesCache).length);

            // Configurar listener para attendances (atualização em tempo real)
            // CORREÇÃO: Usar a referência correta
            attendancesRef.orderByChild("timestamp").on("value", (snapshot) => {
                const attendancesData = snapshot.val() || {};
                allAttendances = Object.keys(attendancesData).map(key => ({
                    id: key,
                    ...attendancesData[key]
                })).sort((a, b) => getNumericTimestamp(b.timestamp) - getNumericTimestamp(a.timestamp)); // Ordena por mais recente

                console.log("Atendimentos carregados/atualizados:", allAttendances.length);

                // CORREÇÃO: Construir o cache de atendentes a partir dos atendimentos carregados
                buildAttendantCache(allAttendances);

                isLoading = false;
                updateUI(); // Atualiza toda a interface (estatísticas, tabelas)
            }, (error) => {
                console.error("Erro ao carregar atendimentos:", error);
                isLoading = false;
                showErrorIndicators(); // Mostra erro nas tabelas
                alert("Erro ao carregar dados de atendimentos do Firebase.");
            });

        } catch (error) {
            console.error("Erro ao carregar dados iniciais (clientes):", error);
            isLoading = false;
            showErrorIndicators();
            alert("Erro ao carregar dados de clientes do Firebase.");
        }
    }

    // CORREÇÃO: Nova função para construir o cache de atendentes
    function buildAttendantCache(attendances) {
        const tempCache = {};
        attendances.forEach(att => {
            // Assumindo que cada atendimento tem 'atendenteId' e 'atendenteNome'
            // Ajuste os nomes dos campos se forem diferentes no seu Firebase
            const id = att.atendenteId;
            const nome = att.atendenteNome; // <<< VERIFIQUE SE ESTE É O CAMPO CORRETO

            if (id && nome && !tempCache[id]) {
                tempCache[id] = { nome: nome }; // Estrutura esperada por populateAttendantFilters
            }
        });
        atendentesCache = tempCache;
        console.log("Cache de Atendentes construído:", Object.keys(atendentesCache).length);
    }

    function showLoadingIndicators() {
        document.querySelectorAll("tbody").forEach(tbody => {
            tbody.innerHTML = `<tr><td colspan="${tbody.previousElementSibling.rows[0].cells.length}" style="text-align: center; padding: 20px; color: #888;">Carregando dados...</td></tr>`;
        });
        // Zerar estatísticas enquanto carrega
        updateStats(0, 0, 0, 0);
    }

    function showErrorIndicators() {
        document.querySelectorAll("tbody").forEach(tbody => {
            tbody.innerHTML = `<tr><td colspan="${tbody.previousElementSibling.rows[0].cells.length}" style="text-align: center; padding: 20px; color: var(--danger-color);">Erro ao carregar dados. Verifique o console.</td></tr>`;
        });
    }

    // --- Funções de Atualização da Interface ---

    function updateUI() {
        if (isLoading) return; // Não atualiza se ainda estiver carregando
        console.log("Atualizando UI...");
        populateAttendantFilters(); // Garante que filtros de atendente estejam atualizados
        const activeTab = document.querySelector('.tab.active')?.getAttribute('data-tab') || 'recent';
        loadDataForTab(activeTab); // Recarrega dados da aba ativa com base nos filtros atuais
        calculateAndDisplayStats(); // Calcula e exibe as estatísticas gerais
    }

    function populateAttendantFilters() {
        // Agora usa o atendentesCache construído dinamicamente
        const attendantNames = Object.values(atendentesCache)
                                   .map(att => att.nome)
                                   .filter((name, index, self) => name && self.indexOf(name) === index) // Nomes únicos e não vazios
                                   .sort(); // Ordena alfabeticamente

        const selects = document.querySelectorAll('#attendantFilter, #saleAttendantFilter, #paymentAttendantFilter, #attendantAttendantFilter');

        selects.forEach(select => {
            const currentValue = select.value;
            // Limpar opções existentes (exceto a primeira "Todos")
            while (select.options.length > 1) {
                select.remove(1);
            }
            // Adicionar atendentes
            attendantNames.forEach(name => {
                // Encontrar o ID correspondente ao nome (pode haver nomes duplicados, pega o primeiro)
                const attendantId = Object.keys(atendentesCache).find(id => atendentesCache[id].nome === name);
                if (attendantId) {
                    const option = document.createElement('option');
                    option.value = attendantId; // Valor é o ID
                    option.textContent = name; // Texto é o Nome
                    select.appendChild(option);
                }
            });
            // Restaura o valor selecionado (ID), se ainda existir
            if (Object.keys(atendentesCache).includes(currentValue)) {
                select.value = currentValue;
            } else {
                select.value = 'all'; // Volta para 'Todos'
            }
        });
    }

    function calculateAndDisplayStats() {
        let totalClientsCount = 0;
        let totalSalesCount = 0;
        let totalSalesValue = 0;

        const clientIds = new Set();
        allAttendances.forEach(att => {
            if (att.clienteId) {
                clientIds.add(att.clienteId);
            }
            if (att.tipoOperacao === 'sale_completed' || att.tipoOperacao === 'payment') {
                totalSalesCount++;
                totalSalesValue += att.valorTotal || 0;
            }
        });

        // Usa o clientesCache para contar clientes únicos
        totalClientsCount = Object.keys(clientesCache).length; // Ou clientIds.size se preferir contar clientes com atendimentos
        const averageTicket = totalSalesCount > 0 ? totalSalesValue / totalSalesCount : 0;

        updateStats(totalClientsCount, totalSalesCount, totalSalesValue, averageTicket);
    }

    function updateStats(clients, sales, value, avgTicket) {
        document.getElementById('totalClients').textContent = clients;
        document.getElementById('totalSales').textContent = sales;
        document.getElementById('totalValue').textContent = formatCurrency(value);
        document.getElementById('averageTicket').textContent = formatCurrency(avgTicket);
    }

    // --- Funções de Filtragem e Carregamento por Aba ---

    function applyFilters(data, filterPrefix) {
        // Pega os valores dos filtros da interface
        const period = document.getElementById(`${filterPrefix}PeriodFilter`)?.value || 'all';
        const sector = document.getElementById(`${filterPrefix}SectorFilter`)?.value || 'all';
        const operationType = document.getElementById(`${filterPrefix}OperationTypeFilter`)?.value || 'all';
        const attendantId = document.getElementById(`${filterPrefix}AttendantFilter`)?.value || 'all'; // Pega o ID do atendente
        const channel = document.getElementById(`${filterPrefix}ChannelFilter`)?.value || 'all';
        const paymentType = document.getElementById(`${filterPrefix}PaymentTypeFilter`)?.value || 'all';
        const paymentMethod = document.getElementById(`${filterPrefix}PaymentMethodFilter`)?.value || 'all';
        const status = document.getElementById(`${filterPrefix}StatusFilter`)?.value || 'all';
        const minValue = parseFloat(document.getElementById(`${filterPrefix}MinValueFilter`)?.value.replace(',', '.')) || 0;
        const maxValue = parseFloat(document.getElementById(`${filterPrefix}MaxValueFilter`)?.value.replace(',', '.')) || Infinity;
        const product = document.getElementById(`${filterPrefix}ProductFilter`)?.value.toLowerCase() || '';
        const clientSearch = document.getElementById(`${filterPrefix}ClientSearchFilter`)?.value.toLowerCase() || '';
        const clientVisits = parseInt(document.getElementById(`${filterPrefix}ClientVisitsFilter`)?.value) || 0;

        // Calcula limites de data
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const todayEnd = todayStart + 24 * 60 * 60 * 1000;
        const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
        const weekAgoStart = todayStart - 7 * 24 * 60 * 60 * 1000;
        const monthAgoStart = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).getTime();

        // Filtra os dados
        return data.filter(item => {
            const itemTimestampMs = getNumericTimestamp(item.timestamp);
            if (itemTimestampMs === 0) return false;

            let periodMatch = true;
            if (period === 'today') periodMatch = itemTimestampMs >= todayStart && itemTimestampMs < todayEnd;
            else if (period === 'yesterday') periodMatch = itemTimestampMs >= yesterdayStart && itemTimestampMs < todayStart;
            else if (period === 'week') periodMatch = itemTimestampMs >= weekAgoStart;
            else if (period === 'month') periodMatch = itemTimestampMs >= monthAgoStart;
            if (!periodMatch) return false;

            if (sector !== 'all' && item.setor !== sector) return false;

            let operationTypeMatch = true;
            if (operationType !== 'all') {
                if (operationType === 'sale') operationTypeMatch = item.tipoOperacao === 'sale_completed' || item.tipoOperacao === 'payment';
                else if (operationType === 'payment') operationTypeMatch = item.tipoOperacao.startsWith('payment_booklet');
                else if (operationType === 'exchange') operationTypeMatch = item.tipoOperacao === 'exchange';
                else if (operationType === 'info') operationTypeMatch = item.tipoOperacao === 'information' || item.tipoOperacao.startsWith('installment_query');
                else operationTypeMatch = item.tipoOperacao === operationType;
            }
            if (!operationTypeMatch) return false;

            // Filtro Atendente (usando 'atendenteId')
            // CORREÇÃO: Certificar que o campo 'atendenteId' existe no item
            if (attendantId !== 'all' && item.atendenteId !== attendantId) return false;

            if (channel !== 'all' && item.canal !== channel) return false;

            const paymentTypeFilterGroup = document.getElementById('paymentTypeFilterGroup');
            if (paymentTypeFilterGroup && paymentTypeFilterGroup.style.display !== 'none' && paymentType !== 'all') {
                if (paymentType === 'purchase_payment' && item.tipoOperacao !== 'payment') return false;
                if (paymentType === 'booklet_payment' && !item.tipoOperacao.startsWith('payment_booklet')) return false;
                if (paymentType === 'installment_query' && !item.tipoOperacao.startsWith('installment_query')) return false;
            }

            const itemValue = item.valorTotal || 0;
            if (itemValue < minValue || itemValue > maxValue) return false;

            if (paymentMethod !== 'all' && item.metodoPagamento !== paymentMethod) return false;

            // if (status !== 'all' && item.status !== status) return false; // Implementar se houver campo status

            const itemProductsText = (
                (item.produtosVendidos ? item.produtosVendidos.join(' ') : '') +
                (item.produtosInteresse || '') +
                (item.produtoTrocado || '') +
                (item.produtoNovo || '') +
                (item.produtosAdquiridos ? item.produtosAdquiridos.join(' ') : '')
            ).toLowerCase();
            if (product && !itemProductsText.includes(product)) return false;

            // Filtro Busca Cliente (Nome) - Usa o clientesCache
            const clientName = clientesCache[item.clienteId]?.nome || '';
            if (clientSearch && (!clientName || !clientName.toLowerCase().includes(clientSearch))) return false;

            // Filtro Mínimo de Visitas (aplicado depois, na agregação)

            return true;
        });
    }

    function loadRecentAttendances() {
        const tableBody = document.getElementById("recentAttendancesTable");
        tableBody.innerHTML = "";
        const filteredAttendances = applyFilters(allAttendances, "");

        if (filteredAttendances.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Nenhum atendimento encontrado com os filtros aplicados</td></tr>';
            return;
        }

        filteredAttendances.forEach(att => {
            const row = document.createElement("tr");
            // Usa clientesCache e atendentesCache
            const clientName = clientesCache[att.clienteId]?.nome || "Cliente não encontrado";
            const attendantName = atendentesCache[att.atendenteId]?.nome || "Atendente não encontrado"; // <<< VERIFIQUE SE att.atendenteId existe

            row.innerHTML = `
                <td>${formatTimestamp(att.timestamp)}</td>
                <td>${clientName} ${att.clienteId ? '' : '(Não vinculado)'}</td>
                <td>${attendantName}</td>
                <td>${att.setor || "-"}</td>
                <td>${att.tipoOperacao || "-"}</td>
                <td>${getChannelBadge(att.canal)}</td>
                <td>${formatCurrency(att.valorTotal)}</td>
                <td><button class="view-details-btn" data-id="${att.id}">Ver Detalhes</button></td>
            `;
            tableBody.appendChild(row);
        });
        addDetailButtonListeners();
    }

    function loadClients() {
        const tableBody = document.getElementById("clientsTable");
        tableBody.innerHTML = "";
        const filteredAttendances = applyFilters(allAttendances, "client");
        const clientVisitsFilter = parseInt(document.getElementById("clientVisitsFilter")?.value) || 0;

        const clientMap = new Map();
        // Usa o clientesCache para obter informações dos clientes
        for (const clientId in clientesCache) {
             if (!clientMap.has(clientId)) {
                clientMap.set(clientId, {
                    id: clientId,
                    name: clientesCache[clientId].nome, // Assumindo que clientData tem 'nome'
                    contact: clientesCache[clientId].contato || "-", // Assumindo que clientData tem 'contato'
                    attendances: 0,
                    purchases: 0,
                    totalValue: 0,
                    lastAttendanceTimestamp: 0
                });
            }
        }

        // Agrega dados dos atendimentos filtrados aos clientes
        filteredAttendances.forEach(att => {
            if (!att.clienteId || !clientMap.has(att.clienteId)) return; // Ignora se não tem ID ou cliente não está no mapa

            const clientId = att.clienteId;
            const clientData = clientMap.get(clientId);
            clientData.attendances++;
            if (att.tipoOperacao === 'sale_completed' || att.tipoOperacao === 'payment') {
                clientData.purchases++;
                clientData.totalValue += att.valorTotal || 0;
            }
            const itemTimestamp = getNumericTimestamp(att.timestamp);
            if (itemTimestamp > clientData.lastAttendanceTimestamp) {
                clientData.lastAttendanceTimestamp = itemTimestamp;
            }
        });

        const clientsData = Array.from(clientMap.values())
                               .filter(client => client.attendances >= clientVisitsFilter) // Aplica filtro de visitas mínimas
                               .sort((a, b) => b.lastAttendanceTimestamp - a.lastAttendanceTimestamp);

        if (clientsData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Nenhum cliente encontrado com os filtros aplicados</td></tr>';
            return;
        }

        clientsData.forEach(client => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${client.name}</td>
                <td>${client.contact}</td>
                <td>${client.attendances}</td>
                <td>${client.purchases}</td>
                <td>${formatCurrency(client.totalValue)}</td>
                <td>${formatTimestamp(client.lastAttendanceTimestamp)}</td>
                <td><button class="view-client-details-btn" data-client-id="${client.id}">Ver Atendimentos</button></td>
            `; // Botão pode levar a uma visão de cliente
            tableBody.appendChild(row);
        });
        // addClientDetailButtonListeners(); // Implementar se necessário
    }

    function loadSales() {
        const tableBody = document.getElementById("salesTable");
        tableBody.innerHTML = "";
        const salesData = allAttendances.filter(att => att.tipoOperacao === 'sale_completed' || att.tipoOperacao === 'payment');
        const filteredSales = applyFilters(salesData, "sale");

        if (filteredSales.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Nenhuma venda encontrada com os filtros aplicados</td></tr>';
            return;
        }

        filteredSales.forEach(sale => {
            const row = document.createElement("tr");
            const clientName = clientesCache[sale.clienteId]?.nome || "Cliente não encontrado";
            const attendantName = atendentesCache[sale.atendenteId]?.nome || "Atendente não encontrado"; // <<< VERIFIQUE SE sale.atendenteId existe

            row.innerHTML = `
                <td>${formatTimestamp(sale.timestamp)}</td>
                <td>${clientName} ${sale.clienteId ? '' : '(Não vinculado)'}</td>
                <td>${attendantName}</td>
                <td>${sale.setor || "-"}</td>
                <td>${getChannelBadge(sale.canal)}</td>
                <td>${formatCurrency(sale.valorTotal)}</td>
                <td>${sale.metodoPagamento || "-"} ${sale.parcelas > 1 ? `(${sale.parcelas}x)` : ''}</td>
                <td><button class="view-details-btn" data-id="${sale.id}">Ver Detalhes</button></td>
            `;
            tableBody.appendChild(row);
        });
        addDetailButtonListeners();
    }

    function loadPayments() {
        const tableBody = document.getElementById("paymentsTable");
        tableBody.innerHTML = "";
        const paymentOperations = allAttendances.filter(att => att.setor === 'caixa');
        const filteredPayments = applyFilters(paymentOperations, "payment");

        if (filteredPayments.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Nenhuma operação de caixa encontrada com os filtros aplicados</td></tr>';
            return;
        }

        filteredPayments.forEach(pay => {
            const row = document.createElement("tr");
            const clientName = clientesCache[pay.clienteId]?.nome || "-";
            const attendantName = atendentesCache[pay.atendenteId]?.nome || "Operador não encontrado"; // <<< VERIFIQUE SE pay.atendenteId existe

            row.innerHTML = `
                <td>${formatTimestamp(pay.timestamp)}</td>
                <td>${clientName}</td>
                <td>${attendantName}</td>
                <td>${pay.tipoOperacao || "-"}</td>
                <td>${formatCurrency(pay.valorTotal)}</td>
                <td>${pay.metodoPagamento || "-"} ${pay.parcelas > 1 ? `(${pay.parcelas}x)` : ''}</td>
                <td><button class="view-details-btn" data-id="${pay.id}">Ver Detalhes</button></td>
            `;
            tableBody.appendChild(row);
        });
        addDetailButtonListeners();
    }

    function loadAttendants() {
        const tableBody = document.getElementById("attendantsTable");
        tableBody.innerHTML = "";
        const filteredAttendances = applyFilters(allAttendances, "attendant");

        const attendantMap = new Map();
        // Usa o atendentesCache construído para obter informações
        for (const attendantId in atendentesCache) {
             if (!attendantMap.has(attendantId)) {
                attendantMap.set(attendantId, {
                    id: attendantId,
                    name: atendentesCache[attendantId].nome,
                    // sector: atendentesCache[attendantId].setorPrincipal || "-", // Setor não está mais no cache separado
                    attendances: 0,
                    sales: 0,
                    totalValue: 0,
                    lastAttendanceTimestamp: 0
                });
            }
        }

        // Agrega dados dos atendimentos filtrados aos atendentes
        filteredAttendances.forEach(att => {
            // CORREÇÃO: Verificar se o atendimento tem atendenteId e se ele existe no mapa
            if (!att.atendenteId || !attendantMap.has(att.atendenteId)) return;

            const attendantId = att.atendenteId;
            const attendantData = attendantMap.get(attendantId);
            attendantData.attendances++;
            if (att.tipoOperacao === 'sale_completed' || att.tipoOperacao === 'payment') {
                attendantData.sales++;
                attendantData.totalValue += att.valorTotal || 0;
            }
            const itemTimestamp = getNumericTimestamp(att.timestamp);
            if (itemTimestamp > attendantData.lastAttendanceTimestamp) {
                attendantData.lastAttendanceTimestamp = itemTimestamp;
            }
        });

        const attendantsData = Array.from(attendantMap.values())
                                  .sort((a, b) => b.lastAttendanceTimestamp - a.lastAttendanceTimestamp);

        if (attendantsData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Nenhum atendente encontrado com os filtros aplicados</td></tr>'; // Colspan reduzido
            return;
        }

        attendantsData.forEach(att => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${att.name}</td>
                <td>${att.attendances}</td>
                <td>${att.sales}</td>
                <td>${formatCurrency(att.totalValue)}</td>
                <td>${formatTimestamp(att.lastAttendanceTimestamp)}</td>
            `; // Removido coluna setor e botão detalhes
            tableBody.appendChild(row);
        });
        // addAttendantDetailButtonListeners(); // Implementar se necessário
    }

    function loadDataForTab(tabId) {
        console.log(`Carregando dados para aba: ${tabId}`);
        if (isLoading) {
            console.log("Ainda carregando dados iniciais, aguardando...");
            showLoadingIndicators();
            return;
        }
        if (tabId === 'recent') loadRecentAttendances();
        else if (tabId === 'clients') loadClients();
        else if (tabId === 'sales') loadSales();
        else if (tabId === 'payments') loadPayments();
        else if (tabId === 'attendants') loadAttendants();
    }

    // --- Funções do Modal de Detalhes/Edição ---

    function addDetailButtonListeners() {
        document.querySelectorAll('.view-details-btn').forEach(button => {
            button.replaceWith(button.cloneNode(true)); // Remove listener antigo
        });
        document.querySelectorAll('.view-details-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const id = event.target.getAttribute('data-id');
                if (id) {
                    showDetailsModal(id);
                }
            });
        });
        // Adicionar listeners para .view-client-details-btn se necessário
    }

    function showDetailsModal(attendanceId) {
        currentEditingAttendanceId = attendanceId;
        const attendance = allAttendances.find(att => att.id === attendanceId);
        if (!attendance) {
            alert("Atendimento não encontrado!");
            return;
        }

        const modal = document.getElementById("detailsModal");
        const detailsContent = document.getElementById("detailsContent");
        detailsContent.innerHTML = ""; // Limpar conteúdo anterior

        const clientName = clientesCache[attendance.clienteId]?.nome || "(Não vinculado)";
        // CORREÇÃO: Usa o atendentesCache construído dinamicamente
        const attendantName = atendentesCache[attendance.atendenteId]?.nome || "(Não encontrado)"; // <<< VERIFIQUE SE attendance.atendenteId existe

        // Mapeamento de chaves para labels e tipos de input
        const fieldConfig = {
            id: { label: "ID Atendimento", type: "text", readonly: true },
            timestamp: { label: "Data/Hora", type: "datetime-local" },
            clienteId: { label: "Cliente", type: "text", readonly: true, displayValue: clientName },
            // CORREÇÃO: Popula o select de atendentes com o cache dinâmico
            atendenteId: { label: "Atendente", type: "select", options: atendentesCache, useObjectValue: true }, // useObjectValue indica que options é {id: {nome: '...'}, ...}
            setor: { label: "Setor", type: "select", options: { "loja_fisica": "Loja Física", "social_media": "Social Media", "caixa": "Caixa" } },
            canal: { label: "Canal", type: "select", options: { "presencial": "Presencial", "whatsapp": "WhatsApp", "instagram": "Instagram" } },
            tipoOperacao: { label: "Tipo Operação", type: "select", options: {
                "sale_completed": "Venda Concluída",
                "payment": "Pagamento de Compra",
                "information": "Informação",
                "sale_not_completed": "Venda Não Concluída",
                "exchange": "Troca",
                "fitting": "Prova",
                "installment_query_whatsapp": "Consulta Parcela (Whats)",
                "installment_query_store": "Consulta Parcela (Loja)",
                "payment_booklet_whatsapp": "Pagamento Carnê (Whats)",
                "payment_booklet_store": "Pagamento Carnê (Loja)"
            } },
            valorTotal: { label: "Valor Total (R$)", type: "number", step: "0.01" },
            metodoPagamento: { label: "Forma Pagamento", type: "select", options: { "": "N/A", "cash": "Dinheiro", "credit": "Crédito", "debit": "Débito", "pix": "PIX", "transfer": "Transferência", "other": "Outro" } },
            parcelas: { label: "Parcelas", type: "number", step: "1" },
            produtosVendidos: { label: "Produtos Vendidos", type: "textarea" },
            produtosAdquiridos: { label: "Produtos Adquiridos (Caixa)", type: "textarea" },
            produtosInteresse: { label: "Produtos de Interesse", type: "text" },
            produtoTrocado: { label: "Produto Trocado (Original)", type: "text" },
            produtoNovo: { label: "Produto Novo (Troca)", type: "text" },
            tamanhoOriginal: { label: "Tamanho Original (Troca)", type: "text" },
            tamanhoNovo: { label: "Tamanho Novo (Troca)", type: "text" },
            valorProdutosAdicionais: { label: "Valor Produtos Adicionais (Troca, R$)", type: "number", step: "0.01" },
            valorProdutoAntigo: { label: "Valor Produto Antigo (Troca, R$)", type: "number", step: "0.01" },
            valorProdutoNovo: { label: "Valor Produto Novo (Troca, R$)", type: "number", step: "0.01" },
            valorPago: { label: "Valor Pago (Carnê, R$)", type: "number", step: "0.01" },
            valorVendaAdicional: { label: "Valor Venda Adicional (Caixa, R$)", type: "number", step: "0.01" },
            motivoNaoVenda: { label: "Motivo Não Venda", type: "text" },
            motivoNaoOferta: { label: "Motivo Não Oferta (Caixa)", type: "text" },
            motivoNaoVendaAdicional: { label: "Motivo Não Venda Adicional (Caixa)", type: "text" },
            descontoAplicado: { label: "Desconto Aplicado (Caixa)", type: "text" },
            observacoes: { label: "Observações", type: "textarea" }
        };

        let detailsHTML = `<input type="hidden" id="editAttendanceId" value="${attendanceId}">`;

        for (const key in fieldConfig) {
            if (attendance.hasOwnProperty(key) || key === 'clienteId' || key === 'id' || key === 'atendenteId') { // Inclui campos mesmo que vazios se configurados
                const config = fieldConfig[key];
                let currentValue = key === 'id' ? attendanceId : attendance[key];
                if (key === 'clienteId') currentValue = clientName; // Usa o nome para exibição
                if (key === 'produtosVendidos' || key === 'produtosAdquiridos') {
                    currentValue = Array.isArray(currentValue) ? currentValue.join('\n') : currentValue;
                }
                currentValue = currentValue ?? ""; // Garante que não seja undefined/null

                detailsHTML += `<div class="detail-row">
                                    <label for="edit-${key}">${config.label}:</label>`;

                if (config.readonly) {
                    detailsHTML += `<input type="text" id="edit-${key}" name="${key}" value="${config.displayValue || currentValue}" readonly>`;
                } else if (config.type === "select") {
                    detailsHTML += `<select id="edit-${key}" name="${key}">`;
                    if (config.useObjectValue) { // Para atendentes
                        for (const optId in config.options) {
                            const selected = optId === attendance[key] ? " selected" : "";
                            detailsHTML += `<option value="${optId}"${selected}>${config.options[optId].nome}</option>`;
                        }
                    } else { // Para outros selects
                         for (const optValue in config.options) {
                            const selected = optValue === currentValue ? " selected" : "";
                            detailsHTML += `<option value="${optValue}"${selected}>${config.options[optValue]}</option>`;
                        }
                    }
                    detailsHTML += `</select>`;
                } else if (config.type === "textarea") {
                    detailsHTML += `<textarea id="edit-${key}" name="${key}">${currentValue}</textarea>`;
                } else if (config.type === "datetime-local") {
                    // Formatar timestamp para datetime-local input
                    let dtValue = "";
                    if (currentValue) {
                        try {
                            const date = new Date(currentValue);
                            if (!isNaN(date)) {
                                dtValue = date.toISOString().slice(0, 16);
                            }
                        } catch (e) { console.error("Erro ao formatar data para input:", e); }
                    }
                    detailsHTML += `<input type="datetime-local" id="edit-${key}" name="${key}" value="${dtValue}">`;
                } else {
                    detailsHTML += `<input type="${config.type}" id="edit-${key}" name="${key}" value="${currentValue}" ${config.step ? `step="${config.step}"` : ''}>`;
                }
                detailsHTML += `</div>`;
            }
        }

        detailsContent.innerHTML = detailsHTML;
        modal.style.display = "block";
    }

    function closeDetailsModal() {
        const modal = document.getElementById("detailsModal");
        modal.style.display = "none";
        currentEditingAttendanceId = null;
    }

    function saveAttendanceChanges() {
        if (!currentEditingAttendanceId) return;

        const formElements = document.getElementById("detailsContent").elements;
        const updatedData = {};

        for (let i = 0; i < formElements.length; i++) {
            const element = formElements[i];
            if (element.name) {
                let value = element.value;
                const config = fieldConfig[element.name]; // Reutiliza a config para saber o tipo

                // Converter tipos numéricos
                if (config?.type === 'number') {
                    value = parseFloat(value) || null; // Converte para número ou null se inválido
                } else if (config?.type === 'datetime-local') {
                    // Converter para timestamp ISO ou similar, se necessário
                    value = value ? new Date(value).toISOString() : null;
                } else if (element.tagName === 'TEXTAREA' && (element.name === 'produtosVendidos' || element.name === 'produtosAdquiridos')) {
                    // Converter textarea de produtos de volta para array
                    value = value.split('\n').map(s => s.trim()).filter(Boolean);
                }

                // Não salvar campos somente leitura como ID ou nome do cliente
                if (element.name !== 'id' && element.name !== 'clienteId') {
                     updatedData[element.name] = value;
                }
            }
        }

        console.log("Salvando alterações para:", currentEditingAttendanceId, updatedData);

        // CORREÇÃO: Usar a referência correta
        attendancesRef.child(currentEditingAttendanceId).update(updatedData)
            .then(() => {
                console.log("Atendimento atualizado com sucesso!");
                closeDetailsModal();
                // O listener 'on' já deve atualizar a UI automaticamente
            })
            .catch((error) => {
                console.error("Erro ao atualizar atendimento:", error);
                alert("Erro ao salvar alterações. Verifique o console.");
            });
    }

    // --- Event Listeners ---
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
            loadDataForTab(tabId);
        });
    });

    document.querySelectorAll('.filter-section select, .filter-section input').forEach(input => {
        input.addEventListener('change', () => {
            const activeTab = document.querySelector('.tab.active')?.getAttribute('data-tab') || 'recent';
            loadDataForTab(activeTab);
        });
    });

    // Modal listeners
    document.querySelector('.close-btn').addEventListener('click', closeDetailsModal);
    document.getElementById('saveChangesBtn').addEventListener('click', saveAttendanceChanges);
    window.addEventListener('click', (event) => {
        const modal = document.getElementById("detailsModal");
        if (event.target == modal) {
            closeDetailsModal();
        }
    });

    // --- Inicialização ---
    loadInitialData();

});

